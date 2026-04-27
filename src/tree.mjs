function matchesKey(data, key) {
	const value = String(data ?? "");
	const lower = value.toLowerCase();
	const normalizedKey = String(key).toLowerCase();
	if (key === "escape") return lower === "escape" || value === "\u001b";
	if (key === "ctrl+c") return lower === "ctrl+c" || value === "\u0003";
	if (key === "up") return lower === "up" || value === "\u001b[A";
	if (key === "down") return lower === "down" || value === "\u001b[B";
	if (key === "right") return lower === "right" || value === "\u001b[C";
	if (key === "left") return lower === "left" || value === "\u001b[D";
	if (key === "home") return lower === "home" || value === "\u001b[H" || value === "\u001b[1~";
	if (key === "end") return lower === "end" || value === "\u001b[F" || value === "\u001b[4~";
	if (key === "tab") return lower === "tab" || value === "\t" || value === "\u0009";
	if (key === "backspace") return lower === "backspace" || value === "\u007f" || value === "\b";
	if (key === "enter" || key === "return") return lower === "enter" || lower === "return" || value === "\r" || value === "\n";
	if (key === "delete") return lower === "delete" || value === "\u001b[3~";
	return lower === normalizedKey;
}

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function visibleWidth(value) {
	return String(value ?? "").replace(ANSI_PATTERN, "").length;
}

function truncateToWidth(value, width) {
	const text = String(value ?? "");
	if (width <= 0) return "";
	let result = "";
	let visible = 0;
	for (let i = 0; i < text.length; i += 1) {
		if (text[i] === "\u001b") {
			const match = text.slice(i).match(/^\x1b\[[0-9;]*m/);
			if (match) {
				result += match[0];
				i += match[0].length - 1;
				continue;
			}
		}
		if (visible >= width) break;
		result += text[i];
		visible += 1;
	}
	return result;
}

function padRight(value, width) {
	const text = truncateToWidth(value, width);
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function wrapPlainText(value, width) {
	const text = String(value ?? "");
	if (width <= 0) return [""];
	if (!text) return [""];
	const wrapped = [];
	for (const paragraph of text.split("\n")) {
		if (!paragraph) {
			wrapped.push("");
			continue;
		}
		let rest = paragraph;
		while (rest.length > width) {
			wrapped.push(rest.slice(0, width));
			rest = rest.slice(width);
		}
		wrapped.push(rest);
	}
	return wrapped;
}

function viewportBounds(total, selectedIndex, size) {
	if (total <= size) return { start: 0, end: total };
	const half = Math.floor(size / 2);
	let start = Math.max(0, selectedIndex - half);
	let end = Math.min(total, start + size);
	start = Math.max(0, end - size);
	return { start, end };
}

function renderTreeRow(node, depth, isSelected, isExpanded, theme, width) {
	const prefix = "  ".repeat(depth);
	let icon = "•";
	if (node.kind === "root") icon = "◎";
	else if (node.kind === "scope" || node.kind === "type" || node.kind === "topic") icon = isExpanded ? "▾" : "▸";
	else if (node.kind === "record") icon = "◦";

	let label = node.label;
	if (node.kind === "scope") label = `${node.label} ${theme.fg("dim", `(${node.count})`)}`;
	else if (node.kind === "type") label = `${node.label} ${theme.fg("dim", `(${node.count})`)}`;
	else if (node.kind === "topic") label = `${node.label} ${theme.fg("dim", `(${node.count})`)}`;
	else if (node.kind === "record") {
		const record = node.record;
		const rev = record.revision && record.revision > 1 ? ` ${theme.fg("dim", `rev ${record.revision}`)}` : "";
		const topic = record.topicKey ? ` ${theme.fg("dim", `#${record.topicKey}`)}` : "";
		label = `${node.label}${rev}${topic}`;
	}

	const rawLine = `${prefix}${icon} ${label}`;
	if (isSelected) return truncateToWidth(theme.fg("accent", theme.bold(`>${rawLine}`)), width);
	return truncateToWidth(rawLine, width);
}

function renderSplitColumns(leftLines, rightLines, leftWidth, rightWidth, separator) {
	const rows = Math.max(leftLines.length, rightLines.length);
	const lines = [];
	for (let i = 0; i < rows; i += 1) {
		const left = padRight(leftLines[i] ?? "", leftWidth);
		const right = padRight(rightLines[i] ?? "", rightWidth);
		lines.push(`${left}${separator}${right}`);
	}
	return lines;
}

function padLines(lines, total) {
	const result = [...lines];
	while (result.length < total) result.push("");
	return result.slice(0, total);
}

function renderDetailPane(node, theme, width, bodyRows, detailsScroll = 0, focused = false) {
	const headerLine = truncateToWidth(
		(focused ? theme.fg("accent", theme.bold(" Details ")) : theme.fg("muted", theme.bold(" Details "))) +
			theme.fg("success", "─".repeat(Math.max(0, width - 10))),
		width,
	);
	if (!node) {
		return {
			lines: padLines([headerLine, theme.fg("muted", "No selection")], bodyRows),
			scroll: 0,
			maxScroll: 0,
		};
	}

	const metaLines = [];
	let contentLines = [];
	if (node.kind === "root") {
		metaLines.push(`  ${theme.fg("muted", "Overview")} ${theme.fg("dim", `${node.count} record(s)`)} `);
	} else if (node.kind === "scope") {
		metaLines.push(`  Scope: ${theme.fg("accent", node.scope)}`);
		metaLines.push(`  Records: ${theme.fg("muted", String(node.count))}`);
	} else if (node.kind === "type") {
		metaLines.push(`  Scope: ${theme.fg("accent", node.scope)}`);
		metaLines.push(`  Type: ${theme.fg("accent", node.type)}`);
		metaLines.push(`  Records: ${theme.fg("muted", String(node.count))}`);
	} else if (node.kind === "topic") {
		metaLines.push(`  Topic: ${theme.fg("accent", node.topicKey)}`);
		metaLines.push(`  Type: ${theme.fg("accent", node.type)}`);
		metaLines.push(`  Scope: ${theme.fg("accent", node.scope)}`);
		metaLines.push(`  Records: ${theme.fg("muted", String(node.count))}`);
	} else if (node.kind === "record") {
		const record = node.record;
		metaLines.push(`  Title: ${theme.fg("accent", record.title)}`);
		metaLines.push(`  Type: ${theme.fg("accent", record.type)}`);
		metaLines.push(`  Scope: ${theme.fg("accent", record.scope)}`);
		if (record.topicKey) metaLines.push(`  Topic: ${theme.fg("accent", record.topicKey)}`);
		if (record.revision) metaLines.push(`  Revision: ${theme.fg("accent", String(record.revision))}`);
		if (record.updatedAt) metaLines.push(`  Updated: ${theme.fg("dim", record.updatedAt)}`);
		if (record.createdAt) metaLines.push(`  Created: ${theme.fg("dim", record.createdAt)}`);
		contentLines.push(`  ${theme.fg("muted", "Content")}`);
		for (const paragraph of safeText(record.content).split("\n")) {
			for (const wrapped of wrapPlainText(paragraph, Math.max(1, width - 2))) {
				contentLines.push(`  ${wrapped}`);
			}
		}
	}

	const staticLines = [headerLine, ...metaLines.map((line) => truncateToWidth(line, width))];
	const availableContentRows = Math.max(0, bodyRows - staticLines.length - (contentLines.length > 0 ? 1 : 0));
	const maxScroll = Math.max(0, contentLines.length - availableContentRows);
	const scroll = Math.max(0, Math.min(detailsScroll, maxScroll));
	const contentBlock = contentLines.length > 0
		? ["", ...contentLines.slice(scroll, scroll + availableContentRows).map((line) => truncateToWidth(line, width))]
		: [];

	return {
		lines: padLines([...staticLines, ...contentBlock], bodyRows),
		scroll,
		maxScroll,
	};
}

const SCOPE_ORDER = ["branch-local", "project", "personal"];
const TYPE_ORDER = ["architecture", "decision", "bugfix", "discovery", "pattern", "preference", "session_summary"];

function safeText(value) {
	return String(value ?? "");
}

function scopeRank(scope) {
	const index = SCOPE_ORDER.indexOf(scope);
	return index === -1 ? SCOPE_ORDER.length : index;
}

function typeRank(type) {
	const index = TYPE_ORDER.indexOf(type);
	return index === -1 ? TYPE_ORDER.length : index;
}

function sortByRank(items, rankFn) {
	return [...items].sort((a, b) => {
		const rankA = rankFn(a);
		const rankB = rankFn(b);
		if (rankA !== rankB) return rankA - rankB;
		return safeText(a.label).localeCompare(safeText(b.label));
	});
}

function makeNode(kind, id, label, extra = {}) {
	return { kind, id, label, children: [], ...extra };
}

function ensureChild(parent, child) {
	child.parentId = parent.id;
	parent.children.push(child);
	return child;
}

function sortTree(node) {
	if (!node.children || node.children.length === 0) return node;
	if (node.kind === "root") {
		node.children = sortByRank(node.children, (child) => scopeRank(child.scope));
	} else if (node.kind === "scope") {
		node.children = sortByRank(node.children, (child) => typeRank(child.type));
	} else if (node.kind === "type") {
		node.children = [...node.children].sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === "topic" ? -1 : 1;
			return safeText(a.label).localeCompare(safeText(b.label));
		});
	} else if (node.kind === "topic") {
		node.children = [...node.children].sort((a, b) => {
			const aTime = safeText(a.record?.updatedAt || a.record?.createdAt || a.updatedAt || a.createdAt);
			const bTime = safeText(b.record?.updatedAt || b.record?.createdAt || b.updatedAt || b.createdAt);
			return aTime.localeCompare(bTime);
		});
	}
	for (const child of node.children) sortTree(child);
	return node;
}

export function buildRemembrallTree(records = [], branchPath = []) {
	const root = makeNode("root", "root", "Pi Remembrall Tree", {
		count: records.length,
		branchPath,
	});

	const scopeNodes = new Map();
	const typeNodes = new Map();
	const topicNodes = new Map();

	for (const record of [...records].filter(Boolean)) {
		const scope = record.scope || "project";
		const type = record.type || "unknown";
		const scopeId = `scope:${scope}`;
		const typeId = `${scopeId}/type:${type}`;
		const topicId = record.topicKey ? `${typeId}/topic:${record.topicKey}` : null;

		let scopeNode = scopeNodes.get(scopeId);
		if (!scopeNode) {
			scopeNode = makeNode("scope", scopeId, scope, { scope, count: 0 });
			scopeNodes.set(scopeId, scopeNode);
			ensureChild(root, scopeNode);
		}
		scopeNode.count += 1;

		let typeNode = typeNodes.get(typeId);
		if (!typeNode) {
			typeNode = makeNode("type", typeId, type, { scope, type, count: 0 });
			typeNodes.set(typeId, typeNode);
			ensureChild(scopeNode, typeNode);
		}
		typeNode.count += 1;

		if (topicId) {
			let topicNode = topicNodes.get(topicId);
			if (!topicNode) {
				topicNode = makeNode("topic", topicId, record.topicKey, {
					scope,
					type,
					topicKey: record.topicKey,
					count: 0,
				});
				topicNodes.set(topicId, topicNode);
				ensureChild(typeNode, topicNode);
			}
			topicNode.count += 1;
			ensureChild(topicNode, makeNode("record", record.id, record.title, { record }));
		} else {
			ensureChild(typeNode, makeNode("record", record.id, record.title, { record }));
		}
	}

	return sortTree(root);
}

export function flattenRemembrallTree(root) {
	const flattened = [];
	const walk = (node, depth) => {
		flattened.push({ node, depth });
		for (const child of node.children || []) walk(child, depth + 1);
	};
	walk(root, 0);
	return flattened;
}

function collectVisibleTreeNodes(node, collapsedIds = new Set(), depth = 0, visible = []) {
	visible.push({ node, depth });
	const isExpandable = node.kind !== "record" && (node.children?.length ?? 0) > 0;
	const isCollapsed = node.kind !== "root" && collapsedIds.has(node.id);
	if (isExpandable && !isCollapsed) {
		for (const child of node.children || []) collectVisibleTreeNodes(child, collapsedIds, depth + 1, visible);
	}
	return visible;
}

export function renderTreeLines(tree, selectedId, theme, width = 120, options = {}) {
	const collapsedIds = options.collapsedIds ?? new Set();
	const visible = collectVisibleTreeNodes(tree, collapsedIds);
	const selectedIndex = Math.max(0, visible.findIndex((item) => item.node.id === selectedId));
	const selected = visible[selectedIndex] || visible[0];
	const lines = [];
	const branchText = tree.branchPath?.length ? tree.branchPath.join(" › ") : "root";
	const outerWidth = Math.max(40, options.fixedWidth ?? width);
	const innerWidth = Math.max(32, outerWidth - 4);
	const separator = ` ${theme.fg("success", "│")} `;
	const separatorWidth = 3;
	const treeWidth = Math.max(20, Math.floor((innerWidth - separatorWidth) * 0.38));
	const detailWidth = Math.max(20, innerWidth - separatorWidth - treeWidth);
	const bodyRows = Math.max(8, options.bodyRows ?? 14);
	const treeRows = Math.max(6, bodyRows - 2);
	const border = (left, fill, right) => `${theme.fg("success", left + fill.repeat(Math.max(0, outerWidth - 2)) + right)}`;
	const framed = (content) => `${theme.fg("success", "│")} ${padRight(content, innerWidth)} ${theme.fg("success", "│")}`;
	const viewport = viewportBounds(visible.length, selectedIndex, treeRows);
	const viewportItems = visible.slice(viewport.start, viewport.end);

	const focusedPane = options.focusedPane || "tree";
	const treePaneLines = padLines([
		truncateToWidth(
			(focusedPane === "tree" ? theme.fg("accent", theme.bold(" Tree ")) : theme.fg("muted", theme.bold(" Tree "))) +
				theme.fg("success", "─".repeat(Math.max(0, treeWidth - 6))),
			treeWidth,
		),
		truncateToWidth(theme.fg("dim", `showing ${viewport.start + 1}-${Math.max(viewport.start + 1, viewport.end)} of ${visible.length}`), treeWidth),
		...viewportItems.map((item) => {
			const hasChildren = item.node.kind !== "record" && (item.node.children?.length ?? 0) > 0;
			const isExpanded = item.node.kind === "root" ? true : hasChildren && !collapsedIds.has(item.node.id);
			return renderTreeRow(item.node, item.depth, item.node.id === selected?.node?.id, isExpanded, theme, treeWidth);
		}),
	], bodyRows);

	const detailState = renderDetailPane(selected?.node, theme, detailWidth, bodyRows, options.detailsScroll ?? 0, focusedPane === "details");
	const detailPaneLines = detailState.lines;

	lines.push(border("┌", "─", "┐"));
	lines.push(framed(theme.fg("accent", theme.bold(" Pi Remembrall Tree "))));
	lines.push(framed(`${theme.fg("muted", `${tree.count} memory record(s)`)}  ${theme.fg("dim", branchText)}`));
	lines.push(border("├", "─", "┤"));
	for (const row of renderSplitColumns(treePaneLines, detailPaneLines, treeWidth, detailWidth, separator)) {
		lines.push(framed(row));
	}
	lines.push(border("├", "─", "┤"));
	if (options.pendingForgetRecord) {
		lines.push(framed(theme.fg("accent", `Confirm forget: ${options.pendingForgetRecord.title} [y/N]`)));
	} else if (options.statusMessage) {
		lines.push(framed(theme.fg("muted", options.statusMessage)));
	} else {
		const focusText = focusedPane === "details" ? "Focus: Details" : "Focus: Tree";
		const scrollText = focusedPane === "details" && detailState.maxScroll > 0 ? `  Detail scroll ${detailState.scroll + 1}/${detailState.maxScroll + 1}` : "";
		lines.push(framed(theme.fg("dim", `${focusText}${scrollText}`)));
	}
	lines.push(framed(theme.fg("dim", "Tab switch pane  ↑/↓ tree  j/k details  Enter toggle  Backspace up  d forget  Esc/q close")));
	lines.push(border("└", "─", "┘"));

	return { lines, visible, selectedIndex, viewport, detailState };
}

export function renderNodeDetails(node, theme, width = 120) {
	const lines = [];
	if (node.kind === "root") {
		lines.push(truncateToWidth(`  ${theme.fg("muted", "Overview")} ${theme.fg("dim", `${node.count} record(s)`)} `, width));
		return lines;
	}

	if (node.kind === "scope") {
		lines.push(truncateToWidth(`  Scope: ${theme.fg("accent", node.scope)}`, width));
		lines.push(truncateToWidth(`  Records: ${theme.fg("muted", String(node.count))}`, width));
		return lines;
	}

	if (node.kind === "type") {
		lines.push(truncateToWidth(`  Scope: ${theme.fg("accent", node.scope)}`, width));
		lines.push(truncateToWidth(`  Type: ${theme.fg("accent", node.type)}`, width));
		lines.push(truncateToWidth(`  Records: ${theme.fg("muted", String(node.count))}`, width));
		return lines;
	}

	if (node.kind === "topic") {
		lines.push(truncateToWidth(`  Topic: ${theme.fg("accent", node.topicKey)}`, width));
		lines.push(truncateToWidth(`  Type: ${theme.fg("accent", node.type)}`, width));
		lines.push(truncateToWidth(`  Scope: ${theme.fg("accent", node.scope)}`, width));
		lines.push(truncateToWidth(`  Records: ${theme.fg("muted", String(node.count))}`, width));
		return lines;
	}

	if (node.kind === "record") {
		const record = node.record;
		lines.push(truncateToWidth(`  Title: ${theme.fg("accent", record.title)}`, width));
		lines.push(truncateToWidth(`  Type: ${theme.fg("accent", record.type)}`, width));
		lines.push(truncateToWidth(`  Scope: ${theme.fg("accent", record.scope)}`, width));
		if (record.topicKey) lines.push(truncateToWidth(`  Topic: ${theme.fg("accent", record.topicKey)}`, width));
		if (record.revision) lines.push(truncateToWidth(`  Revision: ${theme.fg("accent", String(record.revision))}`, width));
		if (record.updatedAt) lines.push(truncateToWidth(`  Updated: ${theme.fg("dim", record.updatedAt)}`, width));
		if (record.createdAt) lines.push(truncateToWidth(`  Created: ${theme.fg("dim", record.createdAt)}`, width));
		lines.push("");
		lines.push(truncateToWidth(`  ${theme.fg("muted", "Content")}`, width));
		for (const paragraph of safeText(record.content).split("\n")) {
			for (const wrapped of wrapPlainText(paragraph, Math.max(1, width - 2))) {
				lines.push(truncateToWidth(`  ${wrapped}`, width));
			}
		}
		return lines;
	}

	return lines;
}

export function renderTreePlainText(tree) {
	const visible = flattenRemembrallTree(tree);
	const lines = [];
	lines.push(`Pi Remembrall Tree (${tree.count} record(s))`);
	lines.push(tree.branchPath?.length ? `Branch: ${tree.branchPath.join(" > ")}` : "Branch: root");
	for (const { node, depth } of visible) {
		const prefix = "  ".repeat(depth);
		const label =
			node.kind === "record"
				? `${node.label}${node.record.topicKey ? ` [${node.record.topicKey}]` : ""}${node.record.revision > 1 ? ` (rev ${node.record.revision})` : ""}`
				: `${node.label}${node.count !== undefined ? ` (${node.count})` : ""}`;
		lines.push(`${prefix}- ${label}`);
	}
	return lines.join("\n");
}

export class RemembrallTreeBrowser {
	constructor(getTree, theme, onClose, onForget, requestRender) {
		this.getTree = getTree;
		this.theme = theme;
		this.onClose = onClose;
		this.onForget = onForget;
		this.requestRender = requestRender;
		this.selectedId = null;
		this.pendingForgetId = null;
		this.statusMessage = "";
		this.detailsScroll = 0;
		this.focusedPane = "tree";
		this.collapsedIds = new Set();
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	invalidate() {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	refresh() {
		this.invalidate();
		this.requestRender?.();
	}

	currentTreeSelection() {
		const tree = this.getTree();
		const rendered = renderTreeLines(tree, this.selectedId, this.theme, this.cachedWidth ?? 120, {
			pendingForgetRecord: this.pendingForgetRecord(tree),
			statusMessage: this.statusMessage,
			detailsScroll: this.detailsScroll,
			focusedPane: this.focusedPane,
			collapsedIds: this.collapsedIds,
			fixedWidth: 120,
			bodyRows: 23,
		});
		return { tree, ...rendered };
	}

	pendingForgetRecord(tree = this.getTree()) {
		if (!this.pendingForgetId) return null;
		const current = flattenRemembrallTree(tree).find((item) => item.node.id === this.pendingForgetId)?.node;
		return current?.kind === "record" ? current.record : null;
	}

	isExpandable(node) {
		return Boolean(node && node.kind !== "record" && node.id !== "root" && (node.children?.length ?? 0) > 0);
	}

	toggleNode(node) {
		if (!this.isExpandable(node)) return;
		if (this.collapsedIds.has(node.id)) this.collapsedIds.delete(node.id);
		else this.collapsedIds.add(node.id);
	}

	handleInput(data) {
		const { tree, visible, detailState } = this.currentTreeSelection();
		if (visible.length === 0) return;

		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			if (this.pendingForgetId) {
				this.pendingForgetId = null;
				this.statusMessage = "Forget canceled.";
				this.refresh();
				return;
			}
			this.onClose();
			return;
		}
		if ((matchesKey(data, "q") || matchesKey(data, "Q")) && !this.pendingForgetId) {
			this.onClose();
			return;
		}

		if (this.selectedId == null || !visible.some((item) => item.node.id === this.selectedId)) {
			this.selectedId = visible[0].node.id;
			this.detailsScroll = 0;
			this.refresh();
			return;
		}

		const index = visible.findIndex((item) => item.node.id === this.selectedId);
		const current = visible[index]?.node;

		if (this.pendingForgetId) {
			if (matchesKey(data, "y")) {
				const record = this.pendingForgetRecord(tree);
				this.pendingForgetId = null;
				if (record && this.onForget) {
					Promise.resolve(this.onForget(record)).then(() => {
						this.statusMessage = `Forgot memory ${record.id}: ${record.title}`;
						this.refresh();
					});
				}
				this.refresh();
				return;
			}
			if (matchesKey(data, "n") || matchesKey(data, "backspace") || matchesKey(data, "delete")) {
				this.pendingForgetId = null;
				this.statusMessage = "Forget canceled.";
				this.refresh();
				return;
			}
			return;
		}

		if (matchesKey(data, "tab")) {
			this.focusedPane = this.focusedPane === "tree" ? "details" : "tree";
			this.statusMessage = "";
			this.refresh();
			return;
		}
		if (this.focusedPane === "details") {
			if (matchesKey(data, "j") || matchesKey(data, "down")) {
				if (detailState?.maxScroll > this.detailsScroll) {
					this.detailsScroll += 1;
					this.refresh();
				}
				return;
			}
			if (matchesKey(data, "k") || matchesKey(data, "up")) {
				if (this.detailsScroll > 0) {
					this.detailsScroll -= 1;
					this.refresh();
				}
				return;
			}
			if (matchesKey(data, "home")) {
				this.detailsScroll = 0;
				this.refresh();
				return;
			}
			if (matchesKey(data, "end")) {
				this.detailsScroll = detailState?.maxScroll ?? 0;
				this.refresh();
				return;
			}
			if (matchesKey(data, "left") || matchesKey(data, "backspace")) {
				this.focusedPane = "tree";
				this.refresh();
				return;
			}
			if (matchesKey(data, "r")) {
				this.refresh();
			}
			return;
		}

		if (matchesKey(data, "up")) {
			this.selectedId = visible[Math.max(0, index - 1)].node.id;
			this.detailsScroll = 0;
			this.refresh();
			return;
		}
		if (matchesKey(data, "down")) {
			this.selectedId = visible[Math.min(visible.length - 1, index + 1)].node.id;
			this.detailsScroll = 0;
			this.refresh();
			return;
		}
		if (matchesKey(data, "home")) {
			this.selectedId = visible[0].node.id;
			this.detailsScroll = 0;
			this.refresh();
			return;
		}
		if (matchesKey(data, "end")) {
			this.selectedId = visible[visible.length - 1].node.id;
			this.detailsScroll = 0;
			this.refresh();
			return;
		}
		if (matchesKey(data, "backspace") || matchesKey(data, "left")) {
			if (this.isExpandable(current) && !this.collapsedIds.has(current.id)) {
				this.toggleNode(current);
				this.refresh();
				return;
			}
			if (current && current.parentId) {
				this.selectedId = current.parentId;
				this.detailsScroll = 0;
				this.refresh();
			}
			return;
		}
		if (matchesKey(data, "right")) {
			if (this.isExpandable(current) && this.collapsedIds.has(current.id)) {
				this.toggleNode(current);
				this.refresh();
				return;
			}
		}
		if (matchesKey(data, "enter") || matchesKey(data, "return")) {
			if (this.isExpandable(current)) {
				this.toggleNode(current);
				this.refresh();
				return;
			}
			if (current?.kind === "record") {
				this.focusedPane = "details";
				this.detailsScroll = 0;
				this.refresh();
			}
			return;
		}
		if ((matchesKey(data, "d") || matchesKey(data, "delete")) && current?.kind === "record") {
			this.pendingForgetId = current.id;
			this.statusMessage = "";
			this.refresh();
			return;
		}
		if (matchesKey(data, "r")) {
			this.refresh();
		}
	}

	render(width) {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}
		const tree = this.getTree();
		const { lines, visible } = renderTreeLines(tree, this.selectedId, this.theme, width, {
			pendingForgetRecord: this.pendingForgetRecord(tree),
			statusMessage: this.statusMessage,
			detailsScroll: this.detailsScroll,
			focusedPane: this.focusedPane,
			collapsedIds: this.collapsedIds,
			fixedWidth: 120,
			bodyRows: 23,
		});
		if (this.selectedId == null || !visible.some((item) => item.node.id === this.selectedId)) {
			this.selectedId = visible[0]?.node.id ?? null;
		}
		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}
