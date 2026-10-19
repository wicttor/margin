/**
 * GTK-style tooltip for header bar buttons. Also sets the accessible label,
 * since these buttons are icon-only.
 */
export function tooltip(node: HTMLElement, text: string) {
  let tip: HTMLDivElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const show = () => {
    tip = document.createElement("div");
    tip.className = "tooltip";
    tip.textContent = text;
    document.body.append(tip);
    const anchor = node.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    const left = Math.min(
      Math.max(6, anchor.left + anchor.width / 2 - box.width / 2),
      window.innerWidth - box.width - 6,
    );
    let top = anchor.bottom + 6;
    if (top + box.height > window.innerHeight - 6) top = anchor.top - box.height - 6;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  const hide = () => {
    clearTimeout(timer);
    tip?.remove();
    tip = null;
  };
  const enter = () => {
    clearTimeout(timer);
    timer = setTimeout(show, 500);
  };

  node.setAttribute("aria-label", text);
  node.addEventListener("pointerenter", enter);
  node.addEventListener("pointerleave", hide);
  node.addEventListener("pointerdown", hide);

  return {
    update(next: string) {
      text = next;
      node.setAttribute("aria-label", text);
      if (tip) tip.textContent = text;
    },
    destroy() {
      hide();
      node.removeEventListener("pointerenter", enter);
      node.removeEventListener("pointerleave", hide);
      node.removeEventListener("pointerdown", hide);
    },
  };
}
