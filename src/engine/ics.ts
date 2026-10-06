// Minimal iCalendar (RFC 5545) reader/writer. It keeps every property line as-is so the
// full feed reproduces the source data faithfully, and only interprets what the feeds need.

export interface Property {
  /** Upper-cased property name, e.g. "DTSTART". */
  name: string;
  /** Raw parameter section without the leading ";", e.g. "TZID=Europe/Rome". */
  params: string;
  value: string;
}

export interface Component {
  name: string;
  props: Property[];
  children: Component[];
}

/** Parses an iCalendar document into its top-level components (usually one VCALENDAR). */
export function parseIcs(text: string): Component[] {
  const roots: Component[] = [];
  const stack: Component[] = [];
  for (const line of unfold(text)) {
    if (!line.trim()) continue;
    const prop = parseLine(line);
    if (!prop) continue;
    if (prop.name === "BEGIN") {
      const component: Component = { name: prop.value.trim().toUpperCase(), props: [], children: [] };
      (stack.at(-1)?.children ?? roots).push(component);
      stack.push(component);
    } else if (prop.name === "END") {
      stack.pop();
    } else {
      stack.at(-1)?.props.push(prop);
    }
  }
  return roots;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseLine(line: string): Property | null {
  // The name ends at the first ";" or ":"; parameter values may contain quoted ":" and ";".
  let i = 0;
  while (i < line.length && line[i] !== ";" && line[i] !== ":") i++;
  if (i === 0 || i === line.length) return null;
  const name = line.slice(0, i).toUpperCase();
  if (line[i] === ":") return { name, params: "", value: line.slice(i + 1) };
  let quoted = false;
  let j = i + 1;
  for (; j < line.length; j++) {
    if (line[j] === '"') quoted = !quoted;
    else if (line[j] === ":" && !quoted) break;
  }
  return { name, params: line.slice(i + 1, j), value: line.slice(j + 1) };
}

/** Returns the value of a parameter (unquoted), or undefined. */
export function getParam(prop: Property, name: string): string | undefined {
  const wanted = name.toUpperCase();
  for (const part of splitUnquoted(prop.params, ";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).toUpperCase() === wanted) return part.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return undefined;
}

function splitUnquoted(text: string, separator: string): string[] {
  const parts: string[] = [];
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted;
    else if (text[i] === separator && !quoted) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  if (text) parts.push(text.slice(start));
  return parts;
}

export function getProp(component: Component, name: string): Property | undefined {
  return component.props.find((p) => p.name === name);
}

export function getProps(component: Component, name: string): Property[] {
  return component.props.filter((p) => p.name === name);
}

export function prop(name: string, value: string, params = ""): Property {
  return { name, params, value };
}

/** Escapes a TEXT value (RFC 5545 §3.3.11). */
export function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Serializes components with CRLF line endings and lines folded at 75 octets. */
export function serialize(components: Component[]): string {
  const out: string[] = [];
  const write = (c: Component) => {
    out.push(`BEGIN:${c.name}`);
    for (const p of c.props) out.push(...fold(`${p.name}${p.params ? ";" + p.params : ""}:${p.value}`));
    c.children.forEach(write);
    out.push(`END:${c.name}`);
  };
  components.forEach(write);
  return out.join("\r\n") + "\r\n";
}

const encoder = new TextEncoder();

function fold(line: string): string[] {
  if (encoder.encode(line).length <= 75) return [line];
  const lines: string[] = [];
  let current = "";
  let size = 0;
  // Iterate by code point so multi-byte characters are never split.
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > 75) {
      lines.push(current);
      current = " ";
      size = 1;
    }
    current += char;
    size += bytes;
  }
  lines.push(current);
  return lines;
}
