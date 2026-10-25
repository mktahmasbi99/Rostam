interface Props {
  loading: boolean;
  error: string;
  hasData: boolean;
  onRetry: () => void;
  loadingText?: string;
}

export function ReadState({ loading, error, hasData, onRetry, loadingText = "Loading…" }: Props) {
  return <>
    {loading && !hasData && <p className="loading" role="status">{loadingText}</p>}
    {loading && hasData && <p className="refreshing" role="status">Refreshing…</p>}
    {error && <div className="error-panel read-state-error" role="alert"><span>{error}</span><button className="secondary" onClick={onRetry}>Retry</button></div>}
  </>;
}
