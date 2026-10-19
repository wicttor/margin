export const isMac = navigator.userAgent.includes("Mac");

/** Splits a GTK-style accelerator ("Primary+Shift+S") into the keys to show on keycaps. */
export function accelKeys(accel: string): string[] {
  return accel.split("+").map((key) => {
    if (key === "Primary") return isMac ? "⌘" : "Ctrl";
    if (key === "Shift" && isMac) return "⇧";
    if (key === "Alt" && isMac) return "⌥";
    return key;
  });
}

/** An accelerator as one label, for menus: "Ctrl+Shift+S" or "⇧⌘S". */
export function accelLabel(accel: string): string {
  const keys = accelKeys(accel);
  if (!isMac) return keys.join("+");
  const order = ["⌥", "⇧", "⌘"];
  const mods = keys.filter((k) => order.includes(k)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return mods.join("") + keys.filter((k) => !order.includes(k)).join("");
}
