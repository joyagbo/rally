// Tiny helpers for building page elements safely (text is never treated as HTML).
export const $ = (id) => document.getElementById(id);

export const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// el('button', { class: 'secondary', on: { click: fn } }, 'Label', otherElement)
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'on') for (const [name, fn] of Object.entries(value)) node.addEventListener(name, fn);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}
