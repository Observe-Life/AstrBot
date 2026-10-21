import { apiV1Client } from './http';

export interface WebUIPreferencesData {
  preferences: Record<string, Record<string, unknown>>;
}

export interface CompressContextRequest {
  preferred_provider_id?: string;
  selected_model?: string;
}

export interface CompressContextData {
  message: string;
  summary_chars: number;
  compacted_at: string;
}

export const webuiExtApi = {
  getPreferences() {
    return apiV1Client.get('/webui_preferences');
  },
  putPreference(key: string, value: Record<string, unknown>) {
    return apiV1Client.put('/webui_preferences', { key, value });
  },
  compressContext(sessionId: string, payload: CompressContextRequest) {
    return apiV1Client.post(
      `/chat/sessions/${encodeURIComponent(sessionId)}/compact`,
      payload,
    );
  },
};
