// Small progressive enhancements. Every page works without this file.

// Copy buttons: data-copy="<input id>" copies that field and confirms on the button.
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  const field = document.getElementById(button.dataset.copy);
  if (!field) return;
  try {
    await navigator.clipboard.writeText(field.value);
  } catch {
    field.select();
    document.execCommand("copy");
  }
  const label = button.dataset.label ?? button.textContent;
  button.dataset.label = label;
  button.textContent = button.dataset.copiedLabel;
  clearTimeout(Number(button.dataset.timer));
  button.dataset.timer = String(setTimeout(() => (button.textContent = label), 2000));
});

// Dialogs: data-dialog-open="<dialog id>".
document.addEventListener("click", (event) => {
  const opener = event.target.closest("[data-dialog-open]");
  if (opener) document.getElementById(opener.dataset.dialogOpen)?.showModal();
  // A click on the backdrop closes the dialog.
  if (event.target instanceof HTMLDialogElement) event.target.close();
});

// Read-only link fields select their whole content on focus.
document.addEventListener("focusin", (event) => {
  if (event.target.matches?.("[data-select-on-focus]")) event.target.select();
});

document.addEventListener("submit", (event) => {
  const form = event.target;
  // Forms that need a confirmation: data-confirm="question".
  if (form.dataset.confirm && !confirm(form.dataset.confirm)) {
    event.preventDefault();
    return;
  }
  // Slow forms show they're working and can't be sent twice.
  if (form.hasAttribute("data-pending-form")) {
    const button = form.querySelector("button[type=submit]");
    if (button) {
      if (button.dataset.pendingLabel) button.textContent = button.dataset.pendingLabel;
      setTimeout(() => (button.disabled = true));
    }
  }
});

// One-off messages (?added=…, ?done=…) shouldn't come back when the page is reloaded.
if (/[?&](added|done)=/.test(location.search)) history.replaceState(null, "", location.pathname);

// Remember the browser's timezone, so the preview shows times as the viewer sees them.
{
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const current = document.cookie.split("; ").find((c) => c.startsWith("tz="));
  if (tz && current !== `tz=${encodeURIComponent(tz)}`) {
    document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax; secure`;
    if (document.querySelector("[data-reload-on-tz]")) location.reload();
  }
}
