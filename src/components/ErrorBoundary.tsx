import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Liora UI crash:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            margin: 0,
            padding: 24,
            background: "#0f1218",
            color: "#e8eef7",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ marginTop: 0 }}>Liora failed to load</h1>
          <p style={{ color: "#8b9bb0" }}>
            Open DevTools (F12) → Console for details. You can try hard refresh
            (Ctrl+F5).
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#161b24",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #243041",
            }}
          >
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
