
export interface ImageState {
  original: string | null;
  processed: string | null;
  mimeType: string | null;
  isProcessing: boolean;
  error: string | null;
}

export interface ProcessingHistory {
  id: string;
  original: string;
  processed: string;
  timestamp: number;
}
