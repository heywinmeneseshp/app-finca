export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiFailure {
  success: false;
  message: string;
  errors: { field: string; message: string }[];
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export class ApiRequestError extends Error {
  statusCode: number;
  errors: { field: string; message: string }[];

  constructor(statusCode: number, message: string, errors: { field: string; message: string }[] = []) {
    super(message);
    this.name = 'ApiRequestError';
    this.statusCode = statusCode;
    this.errors = errors;
  }
}
