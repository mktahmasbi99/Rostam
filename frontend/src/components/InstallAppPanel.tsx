export type PwaInstallState = {
  canPrompt: boolean;
  install: () => Promise<void>;
  installed: boolean;
  isIos: boolean;
  isSecure: boolean;
};

export function InstallAppPanel({ state }: { state: PwaInstallState }) {
  let content;

  if (state.installed) {
    content = <p className="install-note" role="status">Installed on this device.</p>;
  } else if (!state.isSecure) {
    content = <p className="install-note">Installation requires Rostam’s HTTPS address. This address can still be used in a browser.</p>;
  } else if (state.canPrompt) {
    content = <>
      <button className="primary install-button" onClick={() => void state.install()}>Install Rostam</button>
      <p className="install-note">Opens the browser’s installation confirmation.</p>
    </>;
  } else if (state.isIos) {
    content = <p className="install-note">In Safari, tap Share, then Add to Home Screen.</p>;
  } else {
    content = <p className="install-note">Use your browser menu to install Rostam. If Install is not available yet, keep this page open briefly and try again.</p>;
  }

  return <section className="settings-card install-card"><h2>Install app</h2>{content}</section>;
}
