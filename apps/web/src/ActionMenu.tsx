import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MenuItem =
  | { id?: string; label: string; action: () => void; disabled?: boolean; checked?: boolean; hint?: string }
  | { heading: string };
export function ActionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    if (!open) return;
    const rect = trigger.current?.getBoundingClientRect(),
      popup = menu.current;
    if (!rect || !popup) return;
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8)),
      top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - popup.offsetHeight - 8)),
    });
    popup.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    const close = () => setOpen(false);
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {label}
        <span className="menu-chevron" aria-hidden="true">
          ⌄
        </span>
      </button>
      {open &&
        createPortal(
          <div
            id={id}
            ref={menu}
            className="action-menu"
            role="menu"
            aria-label={label}
            style={position}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                trigger.current?.focus();
                return;
              }
              if (event.key === "Tab") {
                setOpen(false);
                trigger.current?.focus();
                return;
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
              buttons[next]?.focus();
            }}
          >
            {items.map((item) =>
              "heading" in item ? (
                <div key={item.heading} className="menu-heading" role="presentation">
                  {item.heading}
                </div>
              ) : (
                <button
                  key={item.id ?? item.label}
                  type="button"
                  {...(item.checked === undefined
                    ? { role: "menuitem" as const }
                    : { role: "menuitemcheckbox" as const, "aria-checked": item.checked })}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    trigger.current?.focus();
                    item.action();
                  }}
                >
                  <span className="menu-check" aria-hidden="true">
                    {item.checked ? "✓" : ""}
                  </span>
                  <span>{item.label}</span>
                  {item.hint && <kbd>{item.hint}</kbd>}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
