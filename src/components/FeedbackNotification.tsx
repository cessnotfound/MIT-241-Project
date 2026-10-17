type FeedbackNotificationProps = {
  error?: string
  message?: string
  onDismiss: () => void
}

/** Single shared notification layout for every SAS Portal module. */
export default function FeedbackNotification({
  error = '',
  message = '',
  onDismiss,
}: FeedbackNotificationProps) {
  if (!error && !message) return null

  return (
    <div
      className={`org-feedback-toast ${error ? 'org-feedback-toast--error' : 'org-feedback-toast--success'}`}
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <span className="org-feedback-toast__symbol" aria-hidden="true">
        {error ? '!' : '✓'}
      </span>
      <span className="org-feedback-toast__body">
        <strong>{error ? 'Action failed' : 'Success'}</strong>
        <span>{error || message}</span>
      </span>
      <button
        type="button"
        className="org-feedback-toast__close"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  )
}
