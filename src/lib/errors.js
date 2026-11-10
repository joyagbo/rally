// The login is no longer valid; the user must connect again.
export class AuthError extends Error {}

// Something to report to the user. `status` is the HTTP status to answer with.
export class ApiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}
