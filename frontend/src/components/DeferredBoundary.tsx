import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

class Boundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render(): ReactNode {
    if (this.state.failed) {
      return <div className="deferred-error" role="alert">
        <p>This part of Rostam could not load.</p>
        <button className="secondary" onClick={() => window.location.reload()}>Reload to try again</button>
      </div>;
    }
    return this.props.children;
  }
}

export function DeferredBoundary({ children }: Props) {
  return <Boundary>{children}</Boundary>;
}
