// Full-size image viewer shown over the app when an image is clicked.
import React from 'react';
import {Box, Text, useInput} from 'ink';
import {theme} from './theme.js';
import {ImagePreview} from './components.js';
import {Clickable} from './mouse.js';

const h = React.createElement;

function Button({label, onClick, primary}) {
	return h(Clickable, {layer: 1, marginRight: 1, onClick}, hovered =>
		h(
			Text,
			{backgroundColor: primary ? (hovered ? theme.brandLight : theme.brand) : hovered ? theme.hoverBg : '#2B2D31', color: primary ? '#FFFFFF' : theme.text, bold: primary || hovered},
			` ${label} `,
		),
	);
}

export function ImageViewer({src, columns, rows, onClose, onOpen, onCopy}) {
	useInput((input, key) => {
		if (key.escape || input === 'q') return onClose();
		if (input === 'o') return onOpen();
		if (input === 'c') return onCopy();
	});
	const width = Math.max(columns - 8, 30);
	const maxCols = width - 4;
	const maxRows = Math.max(rows - 12, 6);
	const dims = src.width && src.height ? `${src.width}×${src.height}` : '';
	return h(
		Box,
		{position: 'absolute', top: 2, left: Math.floor((columns - width) / 2), width},
		h(
			Clickable,
			{
				layer: 1,
				hoverable: false,
				onClick: () => {},
				onOutside: onClose,
				flexDirection: 'column',
				alignItems: 'center',
				width,
				borderStyle: 'round',
				borderColor: theme.brand,
				backgroundColor: theme.modalBg,
				paddingX: 1,
			},
			h(
				Box,
				{width: width - 4, justifyContent: 'space-between'},
				h(Text, {color: theme.brandLight, bold: true, wrap: 'truncate-end'}, `🖼  ${src.name ?? 'Image'}`),
				h(Text, {color: theme.dim}, dims),
			),
			h(ImagePreview, {src, maxCols, maxRows}),
			h(
				Box,
				{marginTop: 1, width: width - 4, justifyContent: 'space-between'},
				h(Box, null, h(Button, {label: '↗ Open in browser', onClick: onOpen, primary: true}), h(Button, {label: '🔗 Copy link', onClick: onCopy}), h(Button, {label: '✕ Close', onClick: onClose})),
				h(Text, {color: theme.dim}, 'o open · c copy link · esc close'),
			),
		),
	);
}
