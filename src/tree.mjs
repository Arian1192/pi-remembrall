import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

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

function topicRankKey(record) {
	return `${safeText(record.topicKey)}:${safeText(record.type)}:${safeText(record.title)}`;
}

function makeNode(kind, id, label, extra = {}) {
	return { kind, id, label, children: [], ...extra };
}

function ensureChild(parent, child) {
	child.parentId = parent.id;
	parent.children.push(child);
	return child;
}

function findChild(parent, id) {
	return parent.children.find((child) => child.id === id);
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
			const aTime = safeText(a.updatedAt || a.createdAt);
			const bTime = safeText(b.updatedAt || b.createdAt);
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

export function renderTreeLines(tree, selectedId, theme, width = 120) {
	const visible = flattenRemembrallTree(tree);
	const selectedIndex = Math.max(
		0,
		visible.findIndex((item) => item.node.id === selectedId),
	);
	const selected = visible[selectedIndex] || visible[0];
	const lines = [];

	const branchText = tree.branchPath?.length ? tree.branchPath.join(" › ") : "root";
	lines.push("");
	lines.push(truncateToWidth(theme.fg("accent", theme.bold(" Pi Remembrall Tree ")) + theme.fg("borderMuted", "─".repeat(Math.max(0, width - 24))), width));
	lines.push(truncateToWidth(`  ${theme.fg("muted", `${tree.count} memory record(s)`)}  ${theme.fg("dim", branchText)}`, width));
	lines.push("");

	for (const { node, depth } of visible) {
		const prefix = "  ".repeat(depth);
		let icon = "•";
		if (node.kind === "root") icon = "◎";
		else if (node.kind === "scope" || node.kind === "type" || node.kind === "topic") icon = "▸";
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
		const line = truncateToWidth(rawLine, width);
		if (node.id === selected?.node?.id) {
			lines.push(truncateToWidth(theme.fg("accent", theme.bold(`>${rawLine}`)), width));
		} else {
			lines.push(line);
		}
	}

	lines.push("");
	lines.push(truncateToWidth(theme.fg("accent", theme.bold(" Details ")) + theme.fg("borderMuted", "─".repeat(Math.max(0, width - 12))), width));
	if (selected?.node) {
		lines.push(...renderNodeDetails(selected.node, theme, width));
	}
	lines.push("");
	lines.push(truncateToWidth(theme.fg("dim", "↑/↓ move  Enter drill in  Backspace up  r refresh  Esc close"), width));
	lines.push("");

	return { lines, visible, selectedIndex };
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
			lines.push(truncateToWidth(`  ${paragraph}`, width));
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
	constructor(getTree, theme, onClose) {
		this.getTree = getTree;
		this.theme = theme;
		this.onClose = onClose;
		this.selectedId = null;
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	invalidate() {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	handleInput(data) {
		const tree = this.getTree();
		const { visible } = renderTreeLines(tree, this.selectedId, this.theme, this.cachedWidth ?? 120);
		if (visible.length === 0) return;

		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
			return;
		}

		if (this.selectedId == null || !visible.some((item) => item.node.id === this.selectedId)) {
			this.selectedId = visible[0].node.id;
			this.invalidate();
			return;
		}

		const index = visible.findIndex((item) => item.node.id === this.selectedId);
		if (matchesKey(data, "up")) {
			this.selectedId = visible[Math.max(0, index - 1)].node.id;
			this.invalidate();
			return;
		}
		if (matchesKey(data, "down")) {
			this.selectedId = visible[Math.min(visible.length - 1, index + 1)].node.id;
			this.invalidate();
			return;
		}
		if (matchesKey(data, "home")) {
			this.selectedId = visible[0].node.id;
			this.invalidate();
			return;
		}
		if (matchesKey(data, "end")) {
			this.selectedId = visible[visible.length - 1].node.id;
			this.invalidate();
			return;
		}
		if (matchesKey(data, "backspace") || matchesKey(data, "left")) {
			const current = visible[index]?.node;
			if (current && current.parentId) {
				this.selectedId = current.parentId;
				this.invalidate();
			}
			return;
		}
		if (matchesKey(data, "enter")) {
			const current = visible[index]?.node;
			if (current && current.children && current.children.length > 0) {
				this.selectedId = current.children[0].id;
				this.invalidate();
			}
			return;
		}
		if (matchesKey(data, "r")) {
			this.invalidate();
		}
	}

	render(width) {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}
		const tree = this.getTree();
		const { lines, visible } = renderTreeLines(tree, this.selectedId, this.theme, width);
		if (this.selectedId == null || !visible.some((item) => item.node.id === this.selectedId)) {
			this.selectedId = visible[0]?.node.id ?? null;
		}
		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}
