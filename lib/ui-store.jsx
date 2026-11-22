import { useSyncExternalStore } from "react";

// Tiny external store for the things every screen needs: toast, modal dialog, busy bar.
let state = { toast: { msg: "", show: false, id: 0 }, modal: null, busy: 0 };
const subs = new Set();
let toastTimer = null;

function set(next) {
  state = { ...state, ...next };
  subs.forEach((fn) => fn());
}
const subscribe = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};
const snapshot = () => state;
export const useUi = () => useSyncExternalStore(subscribe, snapshot, snapshot);

export function toast(msg, ms = 3200) {
  clearTimeout(toastTimer);
  set({ toast: { msg: String(msg), show: true, id: state.toast.id + 1 } });
  toastTimer = setTimeout(() => set({ toast: { ...state.toast, show: false } }), ms);
}

export function busy(delta) {
  set({ busy: Math.max(0, state.busy + delta) });
}

export function closeModal() {
  if (state.modal?.resolve) state.modal.resolve(state.modal.cancelValue);
  set({ modal: null });
}

// `content` is a React node, or a function (close) => node for dialogs with their own state.
export function openModal(content, cancelValue = null) {
  return new Promise((resolve) => {
    set({ modal: { content, resolve, cancelValue } });
  });
}

export function finishModal(value) {
  const m = state.modal;
  set({ modal: null });
  if (m?.resolve) m.resolve(value);
}

export function confirmDialog({ title, message, confirmText = "Confirm", danger = false }) {
  return openModal(
    () => (
      <>
        <h4>{title}</h4>
        <p>{message}</p>
        <div className="row2" style={{ marginTop: 14 }}>
          <button className="btn sec" onClick={() => finishModal(false)}>Cancel</button>
          <button className={`btn ${danger ? "red" : "gold"}`} onClick={() => finishModal(true)}>{confirmText}</button>
        </div>
      </>
    ),
    false
  );
}

export function promptDialog({ title, message, placeholder = "", defaultValue = "", type = "text" }) {
  return openModal(
    () => <PromptBody {...{ title, message, placeholder, defaultValue, type }} />,
    null
  );
}

import { useEffect, useRef, useState } from "react";
function PromptBody({ title, message, placeholder, defaultValue, type }) {
  const [value, setValue] = useState(defaultValue);
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const submit = () => {
    if (!value.trim()) return toast("Please enter a value");
    finishModal(value.trim());
  };
  return (
    <>
      <h4>{title}</h4>
      <p>{message}</p>
      <input ref={ref} className="inp" type={type} value={value} placeholder={placeholder} style={{ marginBottom: 14 }}
        onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <div className="row2">
        <button className="btn sec" onClick={() => finishModal(null)}>Cancel</button>
        <button className="btn gold" onClick={submit}>Save</button>
      </div>
    </>
  );
}
