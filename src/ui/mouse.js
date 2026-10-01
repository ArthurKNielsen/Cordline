// Mouse support for Ink: a stdin proxy that strips SGR mouse sequences out of the
// input stream (so Ink only sees keys) plus a React context for hit-testing
// clicks, wheel scrolls and hovers against the laid-out boxes.
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import React, {createContext, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {Box} from 'ink';

const h = React.createElement;

const ENABLE = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h';
const DISABLE = '\x1b[?1003l\x1b[?1002l\x1b[?1000l\x1b[?1006l';
const SGR = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

// Wraps a TTY stdin. Ink reads keys from the proxy; mouse events are emitted on `mouse`.
export function createMouseStdin(stdin = process.stdin, stdout = process.stdout) {
	const mouse = new EventEmitter();
	const proxy = new Readable({read() {}});
	proxy.isTTY = stdin.isTTY;
	proxy.setRawMode = mode => {
		stdin.setRawMode?.(mode);
		return proxy;
	};
	proxy.ref = () => (stdin.ref(), proxy);
	proxy.unref = () => (stdin.unref(), proxy);

	let pending = '';
	stdin.setEncoding('utf8');
	stdin.on('data', chunk => {
		let data = pending + chunk;
		pending = '';
		// Keep an unfinished mouse sequence for the next chunk.
		const partial = data.match(/\x1b\[<[\d;]*$/);
		if (partial) {
			pending = partial[0];
			data = data.slice(0, -pending.length);
		}
		const rest = data.replace(SGR, (_, b, x, y, kind) => {
			const button = Number(b);
			const event = {x: Number(x) - 1, y: Number(y) - 1, button, release: kind === 'm'};
			if (button & 64) mouse.emit('wheel', {...event, delta: button & 1 ? 1 : -1});
			else if (button & 32) mouse.emit('move', event);
			else if (!event.release && (button & 3) === 0) mouse.emit('click', event);
			return '';
		});
		if (rest) proxy.push(rest);
	});

	let enabled = true;
	const disable = () => stdout.write(DISABLE);
	// Turning tracking off hands the mouse back to the terminal for normal text selection.
	const setEnabled = on => {
		enabled = on;
		stdout.write(on ? ENABLE : DISABLE);
	};
	stdout.write(ENABLE);
	process.on('exit', disable);
	return {stdin: proxy, mouse, disable, setEnabled, isEnabled: () => enabled};
}

// ---------- Hit-testing ----------

function absRect(node) {
	let x = 0;
	let y = 0;
	for (let n = node; n?.yogaNode; n = n.parentNode) {
		x += n.yogaNode.getComputedLeft();
		y += n.yogaNode.getComputedTop();
	}
	return {x, y, width: node.yogaNode.getComputedWidth(), height: node.yogaNode.getComputedHeight()};
}

// On-screen rectangle of a box, clipped by any overflow:hidden ancestors.
function rectOf(node) {
	if (!node?.yogaNode) return null;
	let r = absRect(node);
	for (let p = node.parentNode; p?.yogaNode; p = p.parentNode) {
		if (p.style?.overflow !== 'hidden' && p.style?.overflowY !== 'hidden') continue;
		const c = absRect(p);
		const x = Math.max(r.x, c.x);
		const y = Math.max(r.y, c.y);
		const right = Math.min(r.x + r.width, c.x + c.width);
		const bottom = Math.min(r.y + r.height, c.y + c.height);
		r = {x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y)};
	}
	return r;
}

const MouseContext = createContext(null);

export function MouseProvider({mouse, control, children}) {
	const regs = useRef(new Map());
	const [hover, setHover] = useState(null);
	const hoverRef = useRef(null);

	const api = useMemo(
		() => ({
			register(id, entry) {
				regs.current.set(id, entry);
				return () => regs.current.delete(id);
			},
		}),
		[],
	);

	useEffect(() => {
		if (!mouse) return;
		// Most specific target wins: highest layer, then smallest area.
		const hitTest = (x, y, want) => {
			let best = null;
			let topLayer = 0;
			for (const entry of regs.current.values()) if (entry.layer > topLayer && !entry.disabled) topLayer = entry.layer;
			for (const [id, entry] of regs.current) {
				if (entry.disabled || entry.layer < topLayer || !entry.handlers()[want]) continue;
				const r = rectOf(entry.ref.current);
				if (!r || x < r.x || y < r.y || x >= r.x + r.width || y >= r.y + r.height) continue;
				const area = r.width * r.height;
				if (!best || area < best.area) best = {id, entry, area};
			}
			return {best, topLayer};
		};
		const onClick = ({x, y}) => {
			const {best, topLayer} = hitTest(x, y, 'onClick');
			if (best) return best.entry.handlers().onClick({x, y, rect: rectOf(best.entry.ref.current)});
			// Clicked outside the top layer (e.g. a modal): let it close itself.
			for (const entry of regs.current.values()) if (entry.layer === topLayer && topLayer > 0) entry.handlers().onOutside?.();
		};
		const onWheel = ({x, y, delta}) => {
			const {best} = hitTest(x, y, 'onWheel');
			best?.entry.handlers().onWheel(delta);
		};
		const onMove = ({x, y}) => {
			const {best} = hitTest(x, y, 'onClick');
			const id = best?.entry.hoverable === false ? null : (best?.id ?? null);
			if (id !== hoverRef.current) {
				hoverRef.current = id;
				setHover(id);
			}
		};
		mouse.on('click', onClick);
		mouse.on('wheel', onWheel);
		mouse.on('move', onMove);
		return () => {
			mouse.off('click', onClick);
			mouse.off('wheel', onWheel);
			mouse.off('move', onMove);
		};
	}, [mouse]);

	const value = useMemo(() => ({...api, hover, control}), [api, hover, control]);
	return h(MouseContext.Provider, {value}, children);
}

let seq = 0;

// A Box that reacts to the mouse. `children` may be a function of `hovered`.
export function Clickable({onClick, onWheel, onOutside, layer = 0, disabled, hoverable = true, children, ...boxProps}) {
	const ctx = useContext(MouseContext);
	const ref = useRef(null);
	const idRef = useRef(null);
	if (!idRef.current) idRef.current = `m${seq++}`;
	const handlers = useRef({});
	handlers.current = {onClick, onWheel, onOutside};
	useEffect(() => ctx?.register(idRef.current, {ref, layer, disabled, hoverable, handlers: () => handlers.current}), [ctx, layer, disabled, hoverable]);
	const hovered = ctx?.hover === idRef.current;
	return h(Box, {ref, ...boxProps}, typeof children === 'function' ? children(hovered) : children);
}

// {setEnabled(on), isEnabled()} when mouse support is active, otherwise null.
export function useMouseControl() {
	return useContext(MouseContext)?.control ?? null;
}
