export type OsasUser = { id: string; username: string; full_name: string; role: 'OSAS' }
export type OrgRecord = {
  id: string; organization_name: string; college: string | null;
  description: string | null; academic_year: string | null;
  recognition_status: string; office_order_number: string | null;
  username: string;
}
export async function osasGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', signal })
  if (response.status === 401) {
    throw new Error('OSAS session not recognized for this request. Make sure the backend was restarted with the Phase 3 code, then sign in again if needed.')
  }
  if (!response.ok) {
    const data: {error?: string} = await response.json().catch(() => ({}))
    throw new Error(data.error || 'Unable to load data')
  }
  return response.json() as Promise<T>
}
