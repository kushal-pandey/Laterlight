import json
import logging
from types import SimpleNamespace
from typing import Any

import httpx
import numpy as np
import pytest
import tinker

from app.schemas import AIExtractionResult
from app.services.ai_provider import ProviderError, TinkerProvider

MODEL = "Qwen/Qwen3.5-4B"
API_KEY = "test-tinker-api-key"
DOCUMENT_TEXT = (
    "Invoice from Northwind Labs. Total amount is $1240.00 "
    "due on December 18, 2026."
)


def extraction_payload() -> dict[str, Any]:
    primary_action = {
        "title": "Review Northwind Labs invoice",
        "description": (
            "Confirm the invoice details and arrange payment "
            "before the due date."
        ),
        "due_date": "2026-12-18",
        "amount": 1240.0,
        "currency": "USD",
        "counterparty": "Northwind Labs",
        "category": "finance",
        "priority": "high",
        "evidence": {
            "source_excerpt": "Invoice from Northwind Labs",
            "page_numbers": [],
        },
    }

    return {
        "document_type": "invoice",
        "summary": "Northwind Labs sent an invoice for $1,240 due December 18, 2026.",
        "action_title": primary_action["title"],
        "action_description": primary_action["description"],
        "due_date": primary_action["due_date"],
        "amount": primary_action["amount"],
        "currency": primary_action["currency"],
        "counterparty": primary_action["counterparty"],
        "category": primary_action["category"],
        "priority": primary_action["priority"],
        "recommended_next_step": (
            "Verify the invoice against the service agreement."
        ),
        "follow_up_draft": (
            "Hello, please confirm the invoice details and payment instructions."
        ),
        "confidence": 0.95,
        "evidence": primary_action["evidence"],
        "actions": [primary_action],
    }


def multi_action_payload() -> dict[str, Any]:
    payload = extraction_payload()

    second_action = {
        "title": "Schedule dentist appointment",
        "description": "Contact the dentist and confirm an appointment.",
        "due_date": "2026-12-20",
        "amount": None,
        "currency": None,
        "counterparty": None,
        "category": "personal",
        "priority": "medium",
        "evidence": {
            "source_excerpt": "Schedule dentist appointment",
            "page_numbers": [],
        },
    }

    third_action = {
        "title": "Pay electricity bill",
        "description": "Pay the electricity bill before the stated deadline.",
        "due_date": "2026-12-22",
        "amount": None,
        "currency": None,
        "counterparty": None,
        "category": "finance",
        "priority": "high",
        "evidence": {
            "source_excerpt": "Pay electricity bill",
            "page_numbers": [],
        },
    }

    payload["actions"] = [
        payload["actions"][0],
        second_action,
        third_action,
    ]

    return payload


class FakeTokenizer:
    def __init__(self, response: str | list[str]) -> None:
        self.responses = [response] if isinstance(response, str) else response
        self.decode_count = 0
        self.prompts: list[str] = []
        self.chat_template: str | None = "test chat template"
        self.chat_template_calls: list[dict[str, Any]] = []

    def encode(self, prompt: str) -> list[int]:
        assert "personal-administration actions" in prompt
        assert "<document>" in prompt
        self.prompts.append(prompt)
        return [1, 2, 3]

    def apply_chat_template(
        self,
        messages: list[dict[str, str]],
        *,
        tokenize: bool,
        add_generation_prompt: bool,
        return_dict: bool,
        **kwargs: Any,
    ) -> list[int]:
        assert tokenize is True
        assert add_generation_prompt is True
        assert return_dict is False

        self.prompts.append(messages[0]["content"])
        self.chat_template_calls.append({"messages": messages, **kwargs})

        return [1, 2, 3]

    def decode(
        self,
        tokens: list[int],
        skip_special_tokens: bool = True,
    ) -> str:
        assert tokens == [1, 2, 3]
        assert skip_special_tokens is True

        response = self.responses[
            min(self.decode_count, len(self.responses) - 1)
        ]
        self.decode_count += 1

        return response


class FakeSamplingClient:
    def __init__(
        self,
        response: str | list[str],
        inference_error: Exception | None = None,
        tokenizer_error: Exception | None = None,
        sequence_count: int = 1,
        sequence_stop_reason: str = "stop",
    ) -> None:
        self.tokenizer = FakeTokenizer(response)
        self.inference_error = inference_error
        self.tokenizer_error = tokenizer_error
        self.sequence_count = sequence_count
        self.sequence_stop_reason = sequence_stop_reason
        self.sample_calls: list[dict[str, Any]] = []

    def get_tokenizer(self) -> FakeTokenizer:
        if self.tokenizer_error is not None:
            raise self.tokenizer_error

        return self.tokenizer

    async def sample_async(self, **kwargs: Any) -> tinker.types.SampleResponse:
        assert kwargs["num_samples"] == 1
        self.sample_calls.append(kwargs)

        if self.inference_error is not None:
            raise self.inference_error

        return tinker.types.SampleResponse(
            sequences=[
                tinker.types.SampledSequence(
                    stop_reason=self.sequence_stop_reason,
                    sequence_id=f"sample-{index}",
                    tokens_np=np.array([1, 2, 3], dtype=np.int32),
                )
                for index in range(self.sequence_count)
            ]
        )


class FakeServiceClient:
    def __init__(
        self,
        models: list[SimpleNamespace],
        sampling_client: FakeSamplingClient,
        capabilities_error: Exception | None = None,
        sampling_client_error: Exception | None = None,
    ) -> None:
        self.models = models
        self.sampling_client = sampling_client
        self.capabilities_error = capabilities_error
        self.sampling_client_error = sampling_client_error
        self.requested_model: str | None = None
        self.closed_with: str | None = None

    async def get_server_capabilities_async(self) -> SimpleNamespace:
        if self.capabilities_error is not None:
            raise self.capabilities_error

        return SimpleNamespace(supported_models=self.models)

    async def create_sampling_client_async(
        self,
        *,
        base_model: str,
    ) -> FakeSamplingClient:
        if self.sampling_client_error is not None:
            raise self.sampling_client_error

        self.requested_model = base_model
        return self.sampling_client

    async def close(self, status: str) -> None:
        self.closed_with = status


def install_fake_service_client(
    monkeypatch: pytest.MonkeyPatch,
    client: FakeServiceClient,
) -> list[dict[str, Any]]:
    constructor_arguments: list[dict[str, Any]] = []

    def create_service_client(**kwargs: Any) -> FakeServiceClient:
        constructor_arguments.append(kwargs)
        return client

    monkeypatch.setattr(tinker, "ServiceClient", create_service_client)

    return constructor_arguments


def available_model() -> SimpleNamespace:
    return SimpleNamespace(model_name=MODEL, sampleable=True)


@pytest.mark.asyncio
async def test_tinker_provider_rejects_missing_credentials() -> None:
    provider = TinkerProvider(api_key="", model=MODEL)

    with pytest.raises(
        ProviderError,
        match="TINKER_API_KEY is not configured",
    ):
        await provider.extract(DOCUMENT_TEXT)


@pytest.mark.asyncio
async def test_tinker_provider_rejects_model_not_marked_sampleable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeServiceClient(
        models=[SimpleNamespace(model_name=MODEL, sampleable=False)],
        sampling_client=FakeSamplingClient(json.dumps(extraction_payload())),
    )
    install_fake_service_client(monkeypatch, client)

    with pytest.raises(ProviderError, match="not available for sampling"):
        await TinkerProvider(api_key=API_KEY, model=MODEL).extract(DOCUMENT_TEXT)

    assert client.requested_model is None
    assert client.closed_with == "errored"


@pytest.mark.asyncio
async def test_tinker_provider_sanitizes_inference_errors(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    leaked_secret = "secret-value-from-provider-error"
    sensitive_document_text = "Sensitive invoice reference ORCHID-79241."

    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(
            json.dumps(extraction_payload()),
            inference_error=RuntimeError(
                f"authorization failed with {leaked_secret}; "
                f"document: {sensitive_document_text}"
            ),
        ),
    )
    install_fake_service_client(monkeypatch, client)

    with caplog.at_level(logging.ERROR, logger="app.services.ai_provider"):
        with pytest.raises(ProviderError) as error:
            await TinkerProvider(
                api_key=API_KEY,
                model=MODEL,
            ).extract(sensitive_document_text)

    assert leaked_secret not in str(error.value)
    assert leaked_secret not in caplog.text
    assert API_KEY not in caplog.text
    assert sensitive_document_text not in caplog.text
    assert "category=model/sampling" in caplog.text
    assert "exception_type=RuntimeError" in caplog.text
    assert client.closed_with == "errored"


@pytest.mark.asyncio
async def test_tinker_provider_logs_authentication_failure_without_secrets(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = httpx.Request(
        "GET",
        "https://api.tinker.com/api/v1/capabilities",
    )
    response = httpx.Response(
        401,
        request=request,
        text="Unauthorized",
    )
    auth_error = tinker.AuthenticationError(
        f"invalid API key {API_KEY}",
        response=response,
        body={"detail": f"document text: {DOCUMENT_TEXT}"},
    )

    client = FakeServiceClient(
        models=[],
        sampling_client=FakeSamplingClient(""),
        capabilities_error=auth_error,
    )
    install_fake_service_client(monkeypatch, client)

    with caplog.at_level(logging.ERROR, logger="app.services.ai_provider"):
        with pytest.raises(ProviderError, match="authentication failed"):
            await TinkerProvider(
                api_key=API_KEY,
                model=MODEL,
            ).extract(DOCUMENT_TEXT)

    assert "category=authentication" in caplog.text
    assert "exception_type=AuthenticationError" in caplog.text
    assert "HTTP 401" in caplog.text
    assert API_KEY not in caplog.text
    assert DOCUMENT_TEXT not in caplog.text


@pytest.mark.asyncio
async def test_tinker_provider_logs_model_sampling_failure(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = httpx.Request(
        "POST",
        "https://api.tinker.com/api/v1/sampling",
    )
    response = httpx.Response(
        404,
        request=request,
        text="Model unavailable",
    )
    model_error = tinker.NotFoundError(
        "Model unavailable",
        response=response,
        body={"detail": "Model unavailable"},
    )

    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(""),
        sampling_client_error=model_error,
    )
    install_fake_service_client(monkeypatch, client)

    with caplog.at_level(logging.ERROR, logger="app.services.ai_provider"):
        with pytest.raises(
            ProviderError,
            match="model or sampling request failed",
        ):
            await TinkerProvider(
                api_key=API_KEY,
                model=MODEL,
            ).extract(DOCUMENT_TEXT)

    assert "category=model/sampling" in caplog.text
    assert "stage=model/sampling" in caplog.text
    assert "exception_type=NotFoundError" in caplog.text
    assert "HTTP 404" in caplog.text


@pytest.mark.asyncio
async def test_tinker_provider_logs_tokenizer_network_failure(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = httpx.Request(
        "GET",
        "https://huggingface.co/Qwen/Qwen3.5-4B/tokenizer.json",
    )
    response = httpx.Response(
        502,
        request=request,
        text="Bad Gateway",
    )
    tokenizer_error = httpx.HTTPStatusError(
        "502 Bad Gateway",
        request=request,
        response=response,
    )

    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(
            "",
            tokenizer_error=tokenizer_error,
        ),
    )
    install_fake_service_client(monkeypatch, client)

    with caplog.at_level(logging.ERROR, logger="app.services.ai_provider"):
        with pytest.raises(ProviderError, match="network request failed"):
            await TinkerProvider(
                api_key=API_KEY,
                model=MODEL,
            ).extract(DOCUMENT_TEXT)

    assert "category=network" in caplog.text
    assert "stage=tokenizer" in caplog.text
    assert "exception_type=HTTPStatusError" in caplog.text
    assert "HTTP 502 Bad Gateway" in caplog.text
    assert "host=huggingface.co" in caplog.text
    assert API_KEY not in caplog.text
    assert DOCUMENT_TEXT not in caplog.text


@pytest.mark.asyncio
async def test_tinker_provider_validates_and_returns_mocked_inference(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(json.dumps(extraction_payload())),
    )
    constructor_arguments = install_fake_service_client(monkeypatch, client)

    result = await TinkerProvider(
        api_key=API_KEY,
        model=MODEL,
    ).extract(DOCUMENT_TEXT)

    assert result.document_type == "invoice"
    assert result.amount == 1240.0
    assert result.due_date == "2026-12-18"
    assert result.evidence.source_excerpt == "Invoice from Northwind Labs"
    assert len(result.actions) == 1
    assert result.actions[0].title == "Review Northwind Labs invoice"
    assert client.requested_model == MODEL
    assert client.closed_with == "success"
    assert len(client.sampling_client.sample_calls) == 1

    sample_call = client.sampling_client.sample_calls[0]

    assert set(sample_call) == {
        "prompt",
        "num_samples",
        "sampling_params",
    }
    assert sample_call["sampling_params"].model_dump(exclude_unset=True) == {
        "max_tokens": 2048,
        "temperature": 0.2,
    }
    assert len(client.sampling_client.tokenizer.prompts) == 1
    assert constructor_arguments == [
        {
            "display_name": "laterlight",
            "api_key": API_KEY,
        }
    ]


@pytest.mark.asyncio
async def test_tinker_provider_extracts_multiple_distinct_actions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    document = (
        "Invoice from Northwind Labs. Total amount is $1240.00 "
        "due on December 18, 2026. "
        "Schedule dentist appointment. "
        "Pay electricity bill."
    )

    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(
            json.dumps(multi_action_payload()),
        ),
    )
    install_fake_service_client(monkeypatch, client)

    result = await TinkerProvider(
        api_key=API_KEY,
        model=MODEL,
    ).extract(document)

    assert len(result.actions) == 3
    assert [action.title for action in result.actions] == [
        "Review Northwind Labs invoice",
        "Schedule dentist appointment",
        "Pay electricity bill",
    ]
    assert [action.due_date for action in result.actions] == [
        "2026-12-18",
        "2026-12-20",
        "2026-12-22",
    ]
    assert client.closed_with == "success"


@pytest.mark.asyncio
async def test_tinker_provider_rejects_unverifiable_action_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = extraction_payload()
    payload["actions"][0]["evidence"]["source_excerpt"] = (
        "This phrase is not in the document."
    )

    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(json.dumps(payload)),
    )
    install_fake_service_client(monkeypatch, client)

    with pytest.raises(ProviderError, match="invalid extraction data"):
        await TinkerProvider(
            api_key=API_KEY,
            model=MODEL,
        ).extract(DOCUMENT_TEXT)

    assert client.closed_with == "errored"


@pytest.mark.asyncio
async def test_tinker_provider_uses_qwen_chat_template_without_thinking(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(json.dumps(extraction_payload())),
    )
    client.sampling_client.tokenizer.chat_template = "Qwen chat template"
    install_fake_service_client(monkeypatch, client)

    result = await TinkerProvider(
        api_key=API_KEY,
        model=MODEL,
    ).extract(DOCUMENT_TEXT)

    assert result.document_type == "invoice"
    assert client.sampling_client.tokenizer.chat_template_calls == [
        {
            "messages": [
                {
                    "role": "user",
                    "content": client.sampling_client.tokenizer.prompts[0],
                }
            ],
            "enable_thinking": False,
        }
    ]
    assert client.sampling_client.tokenizer.prompts[0].startswith(
        "Extract useful personal-administration actions"
    )


@pytest.mark.asyncio
async def test_tinker_provider_retries_invalid_json_once_then_succeeds(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    initial_output = "model output that is not JSON"

    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(
            [initial_output, json.dumps(extraction_payload())],
        ),
    )
    install_fake_service_client(monkeypatch, client)

    with caplog.at_level(logging.WARNING, logger="app.services.ai_provider"):
        result = await TinkerProvider(
            api_key=API_KEY,
            model=MODEL,
        ).extract(DOCUMENT_TEXT)

    assert result.document_type == "invoice"
    assert len(client.sampling_client.sample_calls) == 2

    prompts = client.sampling_client.tokenizer.prompts

    assert len(prompts) == 2
    assert prompts[0].startswith(
        "Extract useful personal-administration actions"
    )
    assert "The previous extraction response was invalid." in prompts[1]
    assert "JSON Schema:\n" in prompts[1]

    schema_text = prompts[1].split(
        "JSON Schema:\n",
        1,
    )[1].split(
        "\n\nOriginal document text (untrusted):",
        1,
    )[0]

    assert json.loads(schema_text) == AIExtractionResult.model_json_schema()
    assert DOCUMENT_TEXT in prompts[1]
    assert "Do not include Markdown fences, explanations" in prompts[1]
    assert "Do not invent dates, amounts, counterparties, evidence" in prompts[1]
    assert initial_output not in prompts[1]
    assert initial_output not in caplog.text
    assert client.closed_with == "success"


@pytest.mark.asyncio
async def test_tinker_provider_fails_after_one_invalid_output_retry_without_leaking_data(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private_document = "Private account code ORCHID-73921."
    first_output = "First generated private response: {not JSON."
    retry_output = "Second generated private response: {not JSON."

    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(
            [first_output, retry_output],
            sequence_stop_reason="length",
        ),
    )
    install_fake_service_client(monkeypatch, client)

    with caplog.at_level(logging.WARNING, logger="app.services.ai_provider"):
        with pytest.raises(ProviderError, match="invalid extraction data"):
            await TinkerProvider(
                api_key=API_KEY,
                model=MODEL,
            ).extract(private_document)

    assert len(client.sampling_client.sample_calls) == 2
    assert "retrying once" in caplog.text
    assert "exception_type=JSONDecodeError" in caplog.text
    assert "response_length=" in caplog.text
    assert "output_format=leading_prose_before_json" in caplog.text
    assert "stop_reason=length" in caplog.text
    assert "generated_tokens=3" in caplog.text
    assert "max_output_tokens=2048" in caplog.text

    for sensitive_value in (
        private_document,
        first_output,
        retry_output,
        API_KEY,
    ):
        assert sensitive_value not in caplog.text

    assert client.closed_with == "errored"


@pytest.mark.parametrize(
    ("response", "expected_format", "parse_raises"),
    [
        (" \n\t ", "empty", True),
        ("```json\n{}\n```", "markdown_json_fence", False),
        ("Here is the result: {broken}", "leading_prose_before_json", True),
        ('{"incomplete":', "malformed_json_object", True),
        ("The result is not JSON.", "non_json", True),
    ],
)
def test_tinker_provider_classifies_invalid_output_shape_without_content(
    response: str,
    expected_format: str,
    parse_raises: bool,
) -> None:
    assert TinkerProvider._response_format(response) == expected_format

    if parse_raises:
        with pytest.raises(ValueError):
            TinkerProvider._parse_response(response)
    else:
        assert TinkerProvider._parse_response(response) == {}


@pytest.mark.asyncio
async def test_tinker_provider_retries_schema_invalid_output_once_then_succeeds(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    invalid_payload = extraction_payload()
    invalid_payload["due_date"] = "December 18, 2026"

    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(
            [
                json.dumps(invalid_payload),
                json.dumps(extraction_payload()),
            ],
        ),
    )
    install_fake_service_client(monkeypatch, client)

    with caplog.at_level(logging.WARNING, logger="app.services.ai_provider"):
        result = await TinkerProvider(
            api_key=API_KEY,
            model=MODEL,
        ).extract(DOCUMENT_TEXT)

    assert result.due_date == "2026-12-18"
    assert len(client.sampling_client.sample_calls) == 2
    assert "stage=schema_validation" in caplog.text
    assert "exception_type=ValidationError" in caplog.text
    assert client.closed_with == "success"


@pytest.mark.asyncio
async def test_tinker_provider_does_not_retry_provider_api_exception(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(
            json.dumps(extraction_payload()),
            inference_error=RuntimeError("provider request failed"),
        ),
    )
    install_fake_service_client(monkeypatch, client)

    with caplog.at_level(logging.ERROR, logger="app.services.ai_provider"):
        with pytest.raises(
            ProviderError,
            match="model or sampling request failed",
        ):
            await TinkerProvider(
                api_key=API_KEY,
                model=MODEL,
            ).extract(DOCUMENT_TEXT)

    assert len(client.sampling_client.sample_calls) == 1
    assert len(client.sampling_client.tokenizer.prompts) == 1
    assert "retrying once" not in caplog.text
    assert client.closed_with == "errored"


@pytest.mark.asyncio
async def test_tinker_provider_rejects_non_json_from_actual_sdk_response_shape(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = "Generated explanation, not a JSON extraction."

    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(response),
    )
    install_fake_service_client(monkeypatch, client)

    with caplog.at_level(logging.ERROR, logger="app.services.ai_provider"):
        with pytest.raises(ProviderError, match="invalid extraction data"):
            await TinkerProvider(
                api_key=API_KEY,
                model=MODEL,
            ).extract(DOCUMENT_TEXT)

    assert "exception_type=JSONDecodeError" in caplog.text
    assert f"response_length={len(response)}" in caplog.text
    assert "output_format=non_json" in caplog.text
    assert response not in caplog.text
    assert DOCUMENT_TEXT not in caplog.text
    assert API_KEY not in caplog.text
    assert client.closed_with == "errored"


@pytest.mark.asyncio
async def test_tinker_provider_rejects_unexpected_number_of_sdk_sequences(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(
            json.dumps(extraction_payload()),
            sequence_count=2,
        ),
    )
    install_fake_service_client(monkeypatch, client)

    with caplog.at_level(logging.ERROR, logger="app.services.ai_provider"):
        with pytest.raises(ProviderError, match="invalid extraction data"):
            await TinkerProvider(
                api_key=API_KEY,
                model=MODEL,
            ).extract(DOCUMENT_TEXT)

    assert "exception_type=ValueError" in caplog.text
    assert "output_format=unknown" in caplog.text
    assert "sequences" not in caplog.text
    assert client.sampling_client.tokenizer.prompts
    assert client.closed_with == "errored"


def test_tinker_provider_prompt_uses_exact_extraction_schema() -> None:
    prompt = TinkerProvider(
        api_key=API_KEY,
        model=MODEL,
    )._build_prompt(DOCUMENT_TEXT)

    schema_start = prompt.index("JSON Schema:\n") + len("JSON Schema:\n")
    schema_end = prompt.index("\n\nDocument text (untrusted):", schema_start)

    assert prompt.startswith(
        "Extract useful personal-administration actions"
    )
    assert "Return exactly one JSON object conforming to the schema below." in prompt
    assert "Include every required key exactly as named; do not add extra keys." in prompt
    assert "Extract every distinct actionable task supported by the document" in prompt
    assert "Put each independent task in its own actions array entry." in prompt
    assert "no Markdown or code fences, no comments, and no explanatory prose" in prompt
    assert "valid calendar date formatted YYYY-MM-DD" in prompt
    assert "Do not invent dates, amounts, counterparties, or evidence" in prompt

    assert json.loads(
        prompt[schema_start:schema_end]
    ) == AIExtractionResult.model_json_schema()


@pytest.mark.asyncio
async def test_tinker_provider_parses_fenced_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = f"```json\n{json.dumps(extraction_payload())}\n```"

    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(response),
    )
    install_fake_service_client(monkeypatch, client)

    result = await TinkerProvider(
        api_key=API_KEY,
        model=MODEL,
    ).extract(DOCUMENT_TEXT)

    assert result.document_type == "invoice"
    assert result.evidence.source_excerpt == "Invoice from Northwind Labs"
    assert client.closed_with == "success"


@pytest.mark.asyncio
async def test_tinker_provider_rejects_empty_output_with_safe_metadata(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = " \n\t "

    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(response),
    )
    install_fake_service_client(monkeypatch, client)

    with caplog.at_level(logging.ERROR, logger="app.services.ai_provider"):
        with pytest.raises(ProviderError, match="invalid extraction data"):
            await TinkerProvider(
                api_key=API_KEY,
                model=MODEL,
            ).extract(DOCUMENT_TEXT)

    assert "exception_type=EmptyModelOutputError" in caplog.text
    assert f"response_length={len(response)}" in caplog.text
    assert "output_format=empty" in caplog.text
    assert response not in caplog.text
    assert DOCUMENT_TEXT not in caplog.text
    assert API_KEY not in caplog.text
    assert client.closed_with == "errored"


@pytest.mark.asyncio
async def test_tinker_provider_rejects_malformed_json_with_safe_metadata(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = '{"summary": "truncated output"'

    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(response),
    )
    install_fake_service_client(monkeypatch, client)

    with caplog.at_level(logging.ERROR, logger="app.services.ai_provider"):
        with pytest.raises(ProviderError, match="invalid extraction data"):
            await TinkerProvider(
                api_key=API_KEY,
                model=MODEL,
            ).extract(DOCUMENT_TEXT)

    assert "exception_type=JSONDecodeError" in caplog.text
    assert f"response_length={len(response)}" in caplog.text
    assert "output_format=malformed_json_object" in caplog.text
    assert response not in caplog.text
    assert DOCUMENT_TEXT not in caplog.text
    assert API_KEY not in caplog.text
    assert client.closed_with == "errored"


@pytest.mark.asyncio
async def test_tinker_provider_rejects_invalid_model_output(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = extraction_payload()
    payload["due_date"] = "December 18, 2026"

    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(json.dumps(payload)),
    )
    install_fake_service_client(monkeypatch, client)

    with caplog.at_level(logging.ERROR, logger="app.services.ai_provider"):
        with pytest.raises(ProviderError, match="invalid extraction data"):
            await TinkerProvider(
                api_key=API_KEY,
                model=MODEL,
            ).extract(DOCUMENT_TEXT)

    assert client.closed_with == "errored"
    assert "category=invalid-output/schema-validation" in caplog.text
    assert "exception_type=ValidationError" in caplog.text
    assert f"response_length={len(json.dumps(payload))}" in caplog.text
    assert "output_format=json_object" in caplog.text
    assert DOCUMENT_TEXT not in caplog.text


@pytest.mark.asyncio
async def test_tinker_provider_rejects_trailing_content_after_fenced_json(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = (
        f"```json\n{json.dumps(extraction_payload())}\n```\ntrailing"
    )

    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(response),
    )
    install_fake_service_client(monkeypatch, client)

    with caplog.at_level(logging.ERROR, logger="app.services.ai_provider"):
        with pytest.raises(ProviderError, match="invalid extraction data"):
            await TinkerProvider(
                api_key=API_KEY,
                model=MODEL,
            ).extract(DOCUMENT_TEXT)

    assert "exception_type=ValueError" in caplog.text
    assert "output_format=malformed_markdown_fence" in caplog.text
    assert response not in caplog.text
    assert client.closed_with == "errored"


@pytest.mark.asyncio
async def test_tinker_provider_rejects_unverifiable_legacy_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = extraction_payload()
    payload["evidence"]["source_excerpt"] = (
        "This phrase is not in the document."
    )

    client = FakeServiceClient(
        models=[available_model()],
        sampling_client=FakeSamplingClient(json.dumps(payload)),
    )
    install_fake_service_client(monkeypatch, client)

    with pytest.raises(ProviderError, match="invalid extraction data"):
        await TinkerProvider(
            api_key=API_KEY,
            model=MODEL,
        ).extract(DOCUMENT_TEXT)

    assert client.closed_with == "errored"
