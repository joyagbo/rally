// A short burst of confetti when a campaign is scheduled.
// Skipped for people who have asked their device to reduce motion.
const COLORS = ['#ff5a36', '#ff7eb6', '#7c4dff', '#2ecc9a', '#ffd23f', '#5aa2ff'];

export function burst(count = 90) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const box = document.createElement('div');
    box.className = 'confetti';
    box.setAttribute('aria-hidden', 'true');

    for (let i = 0; i < count; i += 1) {
        const piece = document.createElement('span');
        piece.style.setProperty('--x', `${Math.random() * 100}%`);
        piece.style.setProperty('--s', `${8 + Math.random() * 8}px`);
        piece.style.setProperty('--c', COLORS[i % COLORS.length]);
        piece.style.setProperty('--d', `${2.2 + Math.random() * 1.6}s`);
        piece.style.setProperty('--delay', `${Math.random() * 0.5}s`);
        piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 220}px`);
        piece.style.setProperty('--spin', `${360 + Math.random() * 540}deg`);
        box.append(piece);
    }

    document.body.append(box);
    setTimeout(() => box.remove(), 4500);
}