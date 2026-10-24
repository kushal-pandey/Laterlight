
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
).replace(/\/$/, '')

export interface User {
  id: number
  email: string
  full_name: string
  is_active: boolean
  created_at: string
}

export interface AuthToken {
  access_token: string
  token_type: string
}

export interface Document {
  id: number
  user_id: number
  filename: string
  content_type: string
  size_bytes: number
  status: string
  summary: string | null
  created_at: string
}

export interface Action {
  id: number
  user_id: number
  document_id: number | null
  title: string
  description: string
  category: string
  priority: 'high' | 'medium' | 'low' | string
  status: string
  due_date: string | null
  amount: number | null
  currency: string | null
  counterparty: string | null
  source_excerpt: string | null
  evidence_json: string | null
  created_at: string
  updated_at: string
}

export interface DashboardStats {
  total_documents: number
  total_actions: number
  due_soon: number
  overdue: number
  completed_this_month: number
  demo_mode: boolean
}

export interface ExtractionEvidence {
  source_excerpt: string | null
  page_numbers: string[]
}

export interface ExtractedAction {
  title: string
  description: string
  due_date: string | null
  amount: number | null
  currency: string | null
  counterparty: string | null
  category: string
  priority: 'high' | 'medium' | 'low'
  evidence: ExtractionEvidence
}

export interface ExtractionResult {
  document_type: string
  summary: string
  action_title: string
  action_description: string
  actions: ExtractedAction[]
  due_date: string | null
  amount: number | null
  currency: string | null
  counterparty: string | null
  category: string
  priority: 'high' | 'medium' | 'low'
  recommended_next_step: string
  follow_up_draft: string | null
  confidence: number
  evidence: ExtractionEvidence
}

export interface ProcessDocumentResponse {
  document: Document
  action: Action | null
  actions: Action[]
  result: ExtractionResult
}

export interface RegisterPayload {
  email: string
  password: string
  full_name: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface ActionPayload {
  title: string
  description: string
  category?: string
  priority?: string
  due_date?: string | null
  amount?: number | null
  currency?: string | null
  counterparty?: string | null
  source_excerpt?: string | null
  document_id?: number | null
}

export interface DraftPayload {
  action_id?: number | null
  kind?: string
  subject?: string
  content: string
  status?: string
}

const TOKEN_KEY = 'laterlight_access_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const headers = new Headers(options.headers)

  if (!(options.body instanceof FormData) && options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    })
  } catch {
    throw new ApiError(
      `Unable to reach Laterlight API at ${API_BASE_URL}. Check that the backend is running.`,
      0,
    )
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`

    try {
      const body = await response.json() as {
        detail?: string | { msg?: string }[]
      }

      if (typeof body.detail === 'string') {
        message = body.detail
      } else if (Array.isArray(body.detail)) {
        message = body.detail.map((item) => item.msg ?? 'Invalid input').join(', ')
      }
    } catch {
      // Keep the HTTP status message when the response isn't JSON.
    }

    if (response.status === 401 && path !== '/api/v1/auth/login') {
      clearToken()
    }

    throw new ApiError(message, response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export const api = {
  async register(payload: RegisterPayload): Promise<User> {
    return request<User>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async login(payload: LoginPayload): Promise<AuthToken> {
    const token = await request<AuthToken>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    saveToken(token.access_token)
    return token
  },

  async me(): Promise<User> {
    return request<User>('/api/v1/auth/me')
  },

  async logout(): Promise<void> {
    clearToken()
  },

  async listDocuments(): Promise<Document[]> {
    return request<Document[]>('/api/v1/documents')
  },

  async uploadDocument(file: File): Promise<Document> {
    const formData = new FormData()
    formData.append('file', file)

    return request<Document>('/api/v1/documents', {
      method: 'POST',
      body: formData,
    })
  },

  async processDocument(documentId: number): Promise<ProcessDocumentResponse> {
    return request<ProcessDocumentResponse>(
      `/api/v1/documents/${documentId}/process`,
      { method: 'POST' },
    )
  },

  async deleteDocument(documentId: number): Promise<{ deleted: boolean; document_id: number }> {
    return request(`/api/v1/documents/${documentId}`, {
      method: 'DELETE',
    })
  },

  async listActions(filters?: {
    status?: string
    priority?: string
  }): Promise<Action[]> {
    const params = new URLSearchParams()

    if (filters?.status) params.set('status', filters.status)
    if (filters?.priority) params.set('priority', filters.priority)

    const query = params.toString()
    return request<Action[]>(`/api/v1/actions${query ? `?${query}` : ''}`)
  },

  async createAction(payload: ActionPayload): Promise<Action> {
    return request<Action>('/api/v1/actions', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async updateAction(
    actionId: number,
    payload: ActionPayload,
  ): Promise<Action> {
    return request<Action>(`/api/v1/actions/${actionId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  async createDraft(
    actionId: number,
    payload: DraftPayload,
  ): Promise<unknown> {
    return request(`/api/v1/actions/${actionId}/draft`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async dashboard(): Promise<DashboardStats> {
    return request<DashboardStats>('/api/v1/dashboard')
  },
}
