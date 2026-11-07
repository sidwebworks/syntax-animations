//! Code animation engine.
//!
//! Animation is a pure function of time: `Engine::evaluate(t)` says where every token
//! is, what color it is and how visible it is at `t`. No frame depends on the one
//! before it, so frames can be rendered in any order (scrubbing, offline export).
//!
//! The engine never sees text. JS interns each token's string to an id and says how
//! many monospace columns it spans; the engine hands the ids back.

use similar::{capture_diff_slices, Algorithm, DiffOp};

const KIND_TEXT: u32 = 0;
const KIND_SPACE: u32 = 1;
const KIND_NEWLINE: u32 = 2;

/// Set on instances that are line numbers. Their `text` is the number itself.
const STYLE_LINE_NUMBER: u32 = 1 << 8;

/// Gap between line numbers and code, in columns.
const GUTTER_GAP: u32 = 2;
/// With full stagger, the last line starts this far into the transition.
const MAX_LAG: f32 = 0.4;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Token {
	pub text: u32,
	/// 0xRRGGBBAA
	pub color: u32,
	pub style: u32,
	pub cols: u32,
	pub kind: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Placed {
	text: u32,
	color: u32,
	style: u32,
	line: u32,
	col: u32,
}

/// JS reads these straight out of Wasm memory, so the layout is fixed.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Instance {
	pub text: u32,
	pub color: u32,
	pub style: u32,
	pub x: f32,
	pub y: f32,
	pub alpha: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct Options {
	pub char_w: f32,
	pub line_h: f32,
	/// Seconds each slide stays still.
	pub hold: f32,
	/// Seconds each transition takes.
	pub transition: f32,
	/// 0 moves every line at once, 1 sweeps top to bottom.
	pub stagger: f32,
	/// `None` hides line numbers.
	pub gutter_color: Option<u32>,
}

enum Pair {
	Move(usize, usize),
	Leave(usize),
	Enter(usize),
}

struct Slide {
	tokens: Vec<Placed>,
	lines: u32,
	cols: u32,
}

pub struct Engine {
	opts: Options,
	slides: Vec<Slide>,
	/// `pairs[i]` is the transition from slide `i` to slide `i + 1`.
	pairs: Vec<Vec<Pair>>,
	lines: u32,
	cols: u32,
	gutter: u32,
	out: Vec<Instance>,
}

impl Engine {
	pub fn new(slides: &[Vec<Token>], opts: Options) -> Self {
		let slides: Vec<Slide> = slides.iter().map(|t| layout(t)).collect();
		let lines = slides.iter().map(|s| s.lines).max().unwrap_or(0);
		let cols = slides.iter().map(|s| s.cols).max().unwrap_or(0);
		let gutter = match opts.gutter_color {
			Some(_) => digits(lines) + GUTTER_GAP,
			None => 0,
		};
		let pairs = slides.windows(2).map(|w| match_tokens(&w[0].tokens, &w[1].tokens)).collect();
		Engine { opts, slides, pairs, lines, cols, gutter, out: Vec::new() }
	}

	pub fn duration(&self) -> f32 {
		let n = self.slides.len() as f32;
		if n == 0.0 {
			return 0.0;
		}
		n * self.opts.hold + (n - 1.0) * self.opts.transition
	}

	pub fn width(&self) -> f32 {
		(self.gutter + self.cols) as f32 * self.opts.char_w
	}

	pub fn height(&self) -> f32 {
		self.lines as f32 * self.opts.line_h
	}

	/// The frame at `t` seconds, clamped to the timeline.
	pub fn evaluate(&mut self, t: f32) -> &[Instance] {
		self.out.clear();
		if self.slides.is_empty() {
			return &self.out;
		}

		let Options { char_w, line_h, hold, transition, .. } = self.opts;
		let t = t.clamp(0.0, self.duration());
		let segment = hold + transition;
		let i = ((t / segment) as usize).min(self.slides.len() - 1);
		let local = t - i as f32 * segment;
		let x0 = self.gutter as f32 * char_w;
		let at = |p: &Placed| (x0 + p.col as f32 * char_w, p.line as f32 * line_h);

		if local <= hold || i == self.slides.len() - 1 {
			for p in &self.slides[i].tokens {
				let (x, y) = at(p);
				self.out.push(Instance { text: p.text, color: p.color, style: p.style, x, y, alpha: 1.0 });
			}
			self.push_line_numbers(self.slides[i].lines, self.slides[i].lines, 1.0);
			return &self.out;
		}

		// Leaving tokens fade first, matched tokens glide across the middle, new ones fade in last.
		let p = ((local - hold) / transition).clamp(0.0, 1.0);
		let (a, b) = (&self.slides[i], &self.slides[i + 1]);
		let lag = self.lag(a.lines.max(b.lines));
		let leave = |line| 1.0 - ease_out(phase(lag(p, line), 0.0, 0.35));
		let glide = |line| smootherstep(phase(lag(p, line), 0.1, 0.9));
		let enter = |line| ease_out(phase(lag(p, line), 0.6, 1.0));

		for pair in &self.pairs[i] {
			let inst = match *pair {
				Pair::Leave(ai) => {
					let t = &a.tokens[ai];
					let (x, y) = at(t);
					Instance { text: t.text, color: t.color, style: t.style, x, y, alpha: leave(t.line) }
				}
				Pair::Enter(bi) => {
					let t = &b.tokens[bi];
					let (x, y) = at(t);
					let e = enter(t.line);
					Instance { text: t.text, color: t.color, style: t.style, x, y: y + (1.0 - e) * line_h * 0.3, alpha: e }
				}
				Pair::Move(ai, bi) => {
					let (from, to) = (&a.tokens[ai], &b.tokens[bi]);
					let g = glide(to.line);
					let ((ax, ay), (bx, by)) = (at(from), at(to));
					Instance {
						text: to.text,
						color: lerp_color(from.color, to.color, g),
						style: if g < 0.5 { from.style } else { to.style },
						x: lerp(ax, bx, g),
						y: lerp(ay, by, g),
						alpha: 1.0,
					}
				}
			};
			if inst.alpha > 0.001 {
				self.out.push(inst);
			}
		}

		// Numbers for lines only one side has fade with the code on them.
		let (shared, extra) = (a.lines.min(b.lines), a.lines.max(b.lines));
		let fade = if a.lines > b.lines { leave(shared) } else { enter(shared) };
		self.push_line_numbers(shared, extra, fade);
		&self.out
	}

	/// Lines `1..=solid` fully visible, lines up to `faded` at `alpha`.
	fn push_line_numbers(&mut self, solid: u32, faded: u32, alpha: f32) {
		let Some(color) = self.opts.gutter_color else { return };
		let width = digits(self.lines);
		for n in 1..=faded {
			let alpha = if n <= solid { 1.0 } else { alpha };
			if alpha > 0.001 {
				self.out.push(Instance {
					text: n,
					color,
					style: STYLE_LINE_NUMBER,
					x: (width - digits(n)) as f32 * self.opts.char_w,
					y: (n - 1) as f32 * self.opts.line_h,
					alpha,
				});
			}
		}
	}

	/// Progress of a transition for one line, delayed by its position when staggered.
	fn lag(&self, lines: u32) -> impl Fn(f32, u32) -> f32 {
		let span = self.opts.stagger.clamp(0.0, 1.0) * MAX_LAG;
		let last = lines.saturating_sub(1).max(1) as f32;
		move |p, line| ((p - span * line as f32 / last) / (1.0 - span)).clamp(0.0, 1.0)
	}
}

fn layout(tokens: &[Token]) -> Slide {
	let (mut line, mut col, mut cols) = (0, 0, 0);
	let mut out = Vec::new();
	for t in tokens {
		match t.kind {
			KIND_NEWLINE => {
				line += 1;
				col = 0;
				continue;
			}
			KIND_TEXT => out.push(Placed { text: t.text, color: t.color, style: t.style, line, col }),
			KIND_SPACE => {}
			_ => continue,
		}
		col += t.cols;
		cols = cols.max(col);
	}
	Slide { tokens: out, lines: line + 1, cols }
}

/// An order-preserving diff, then leftover removed/added tokens with the same text are
/// paired so code that moved glides instead of fading out and back in.
fn match_tokens(a: &[Placed], b: &[Placed]) -> Vec<Pair> {
	let mut pairs = diff_tokens(a, b);

	let mut leaving: Vec<usize> = pairs.iter().filter_map(|p| if let Pair::Leave(i) = *p { Some(i) } else { None }).collect();
	for pair in pairs.iter_mut() {
		let Pair::Enter(bi) = *pair else { continue };
		// Closest by position, so repeated tokens like `)` pair with their neighbours.
		let best = leaving
			.iter()
			.enumerate()
			.filter(|(_, &ai)| a[ai].text == b[bi].text)
			.min_by_key(|(_, &ai)| a[ai].line.abs_diff(b[bi].line) * 1024 + a[ai].col.abs_diff(b[bi].col))
			.map(|(k, _)| k);
		if let Some(k) = best {
			*pair = Pair::Move(leaving.swap_remove(k), bi);
		}
	}
	pairs.retain(|p| !matches!(p, Pair::Leave(ai) if !leaving.contains(ai)));
	pairs
}

fn diff_tokens(a: &[Placed], b: &[Placed]) -> Vec<Pair> {
	let ka: Vec<u32> = a.iter().map(|p| p.text).collect();
	let kb: Vec<u32> = b.iter().map(|p| p.text).collect();
	let mut pairs = Vec::with_capacity(a.len().max(b.len()));
	for op in capture_diff_slices(Algorithm::Patience, &ka, &kb) {
		match op {
			DiffOp::Equal { old_index, new_index, len } => {
				pairs.extend((0..len).map(|k| Pair::Move(old_index + k, new_index + k)))
			}
			DiffOp::Delete { old_index, old_len, .. } => pairs.extend((old_index..old_index + old_len).map(Pair::Leave)),
			DiffOp::Insert { new_index, new_len, .. } => pairs.extend((new_index..new_index + new_len).map(Pair::Enter)),
			DiffOp::Replace { old_index, old_len, new_index, new_len } => {
				pairs.extend((old_index..old_index + old_len).map(Pair::Leave));
				pairs.extend((new_index..new_index + new_len).map(Pair::Enter));
			}
		}
	}
	pairs
}

fn digits(n: u32) -> u32 {
	n.max(1).ilog10() + 1
}

fn phase(p: f32, start: f32, end: f32) -> f32 {
	((p - start) / (end - start)).clamp(0.0, 1.0)
}

fn ease_out(x: f32) -> f32 {
	1.0 - (1.0 - x).powi(3)
}

fn smootherstep(x: f32) -> f32 {
	x * x * x * (x * (x * 6.0 - 15.0) + 10.0)
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
	a + (b - a) * t
}

fn lerp_color(a: u32, b: u32, t: f32) -> u32 {
	if a == b {
		return a;
	}
	(0..4).fold(0, |acc, i| {
		let shift = 24 - i * 8;
		let (ca, cb) = (((a >> shift) & 0xff) as f32, ((b >> shift) & 0xff) as f32);
		acc | ((lerp(ca, cb, t).round() as u32) << shift)
	})
}

/// Decodes `[slide_count, (token_count, (text, color, style, cols, kind) * token_count) * slide_count]`.
/// Malformed input returns `None`: a panic would abort the whole Wasm instance.
fn decode(data: &[u32]) -> Option<Vec<Vec<Token>>> {
	let mut it = data.iter().copied();
	let slides = it.next()? as usize;
	let mut out = Vec::with_capacity(slides.min(4096));
	for _ in 0..slides {
		let n = it.next()? as usize;
		let mut tokens = Vec::with_capacity(n.min(1 << 20));
		for _ in 0..n {
			let (text, color, style, cols, kind) = (it.next()?, it.next()?, it.next()?, it.next()?, it.next()?);
			tokens.push(Token { text, color, style, cols, kind });
		}
		out.push(tokens);
	}
	it.next().is_none().then_some(out)
}

pub mod ffi {
	use super::*;

	#[no_mangle]
	pub extern "C" fn alloc_u32(len: usize) -> *mut u32 {
		let mut v = Vec::<u32>::with_capacity(len);
		let ptr = v.as_mut_ptr();
		std::mem::forget(v);
		ptr
	}

	/// # Safety
	/// `ptr` and `len` must come from `alloc_u32`.
	#[no_mangle]
	pub unsafe extern "C" fn free_u32(ptr: *mut u32, len: usize) {
		drop(Vec::from_raw_parts(ptr, 0, len));
	}

	/// Returns null if the input is malformed. `gutter_color` 0 hides line numbers.
	///
	/// # Safety
	/// `ptr` must point to `len` readable u32s.
	#[no_mangle]
	#[allow(clippy::too_many_arguments)]
	pub unsafe extern "C" fn engine_new(
		ptr: *const u32,
		len: usize,
		char_w: f32,
		line_h: f32,
		hold: f32,
		transition: f32,
		stagger: f32,
		gutter_color: u32,
	) -> *mut Engine {
		let Some(slides) = decode(std::slice::from_raw_parts(ptr, len)) else {
			return std::ptr::null_mut();
		};
		let opts = Options {
			char_w,
			line_h,
			hold: hold.max(0.0),
			transition: transition.max(0.001),
			stagger,
			gutter_color: (gutter_color != 0).then_some(gutter_color),
		};
		Box::into_raw(Box::new(Engine::new(&slides, opts)))
	}

	/// # Safety
	/// `e` must come from `engine_new` and not be used afterwards.
	#[no_mangle]
	pub unsafe extern "C" fn engine_free(e: *mut Engine) {
		drop(Box::from_raw(e));
	}

	/// # Safety
	/// `e` must be a live engine.
	#[no_mangle]
	pub unsafe extern "C" fn engine_duration(e: *const Engine) -> f32 {
		(*e).duration()
	}

	/// # Safety
	/// `e` must be a live engine.
	#[no_mangle]
	pub unsafe extern "C" fn engine_width(e: *const Engine) -> f32 {
		(*e).width()
	}

	/// # Safety
	/// `e` must be a live engine.
	#[no_mangle]
	pub unsafe extern "C" fn engine_height(e: *const Engine) -> f32 {
		(*e).height()
	}

	/// Returns the instance count; read them from `engine_output`.
	///
	/// # Safety
	/// `e` must be a live engine.
	#[no_mangle]
	pub unsafe extern "C" fn engine_evaluate(e: *mut Engine, t: f32) -> usize {
		(*e).evaluate(t).len()
	}

	/// Valid until the next `engine_evaluate`.
	///
	/// # Safety
	/// `e` must be a live engine.
	#[no_mangle]
	pub unsafe extern "C" fn engine_output(e: *const Engine) -> *const Instance {
		(*e).out.as_ptr()
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	const OPTS: Options = Options { char_w: 10.0, line_h: 20.0, hold: 1.0, transition: 1.0, stagger: 0.0, gutter_color: None };

	fn tok(text: u32, cols: u32) -> Token {
		Token { text, color: 0xffffffff, style: 0, cols, kind: KIND_TEXT }
	}
	fn space(cols: u32) -> Token {
		Token { kind: KIND_SPACE, ..tok(0, cols) }
	}
	fn nl() -> Token {
		Token { kind: KIND_NEWLINE, ..tok(0, 0) }
	}
	fn code(e: &mut Engine, t: f32) -> Vec<Instance> {
		e.evaluate(t).iter().filter(|i| i.style & STYLE_LINE_NUMBER == 0).copied().collect()
	}
	fn numbers(e: &mut Engine, t: f32) -> Vec<(u32, f32)> {
		e.evaluate(t).iter().filter(|i| i.style & STYLE_LINE_NUMBER != 0).map(|i| (i.text, i.alpha)).collect()
	}

	#[test]
	fn layout_places_tokens_on_grid() {
		// "ab cd\n  ef"
		let s = layout(&[tok(1, 2), space(1), tok(2, 2), nl(), space(2), tok(3, 2)]);
		let pos: Vec<_> = s.tokens.iter().map(|p| (p.text, p.line, p.col)).collect();
		assert_eq!(pos, [(1, 0, 0), (2, 0, 3), (3, 1, 2)]);
		assert_eq!((s.lines, s.cols), (2, 5));
	}

	#[test]
	fn empty_slide_is_one_line() {
		assert_eq!(layout(&[]).lines, 1);
	}

	#[test]
	fn holds_show_each_slide_exactly() {
		let mut e = Engine::new(&[vec![tok(1, 3)], vec![nl(), tok(1, 3), space(1), tok(2, 1)]], OPTS);
		assert_eq!(e.duration(), 3.0);

		let start = code(&mut e, 0.5);
		assert_eq!(start.len(), 1);
		assert_eq!((start[0].x, start[0].y, start[0].alpha), (0.0, 0.0, 1.0));

		let end: Vec<_> = code(&mut e, 3.0).iter().map(|i| (i.text, i.x, i.y, i.alpha)).collect();
		assert_eq!(end, [(1, 0.0, 20.0, 1.0), (2, 40.0, 20.0, 1.0)]);
	}

	#[test]
	fn transition_moves_matched_and_fades_new_tokens() {
		let mut e = Engine::new(&[vec![tok(1, 3)], vec![nl(), tok(1, 3), space(1), tok(2, 1)]], OPTS);

		let mid = code(&mut e, 1.5);
		let moved = mid.iter().find(|i| i.text == 1).unwrap();
		assert!(moved.y > 0.0 && moved.y < 20.0, "y = {}", moved.y);
		assert!(mid.iter().all(|i| i.text != 2));

		let late = code(&mut e, 1.9);
		let entering = late.iter().find(|i| i.text == 2).unwrap();
		assert!(entering.alpha > 0.0 && entering.alpha < 1.0);
	}

	#[test]
	fn removed_tokens_fade_out() {
		let mut e = Engine::new(&[vec![tok(1, 1), tok(2, 1)], vec![tok(1, 1)]], OPTS);
		let leaving = code(&mut e, 1.1).into_iter().find(|i| i.text == 2).unwrap();
		assert!(leaving.alpha < 1.0 && leaving.alpha > 0.0);
		assert!(code(&mut e, 1.5).iter().all(|i| i.text != 2));
	}

	#[test]
	fn reordered_tokens_glide_instead_of_fading() {
		let mut e = Engine::new(&[vec![tok(1, 1), space(1), tok(2, 1)], vec![tok(2, 1), space(1), tok(1, 1)]], OPTS);
		let mid = code(&mut e, 1.5);
		assert_eq!(mid.len(), 2, "both tokens stay visible: {mid:?}");
		assert!(mid.iter().all(|i| i.alpha == 1.0 && i.x > 0.0 && i.x < 20.0));
	}

	#[test]
	fn line_numbers_shift_code_and_fade_with_their_lines() {
		let opts = Options { gutter_color: Some(0x888888ff), ..OPTS };
		let ten_lines: Vec<Token> = (0..10).flat_map(|_| [tok(1, 1), nl()]).take(19).collect();
		let mut e = Engine::new(&[vec![tok(1, 1)], ten_lines], opts);

		// 10 lines need 2 digits, plus the gap.
		assert_eq!(code(&mut e, 0.0)[0].x, 40.0);
		assert_eq!(e.width(), 50.0);

		assert_eq!(numbers(&mut e, 0.0), [(1, 1.0)]);
		let late = numbers(&mut e, 1.9);
		assert_eq!(late.len(), 10);
		assert!(late[1..].iter().all(|&(_, a)| a > 0.0 && a < 1.0));
		assert_eq!(numbers(&mut e, 3.0).len(), 10);
	}

	#[test]
	fn stagger_moves_lower_lines_later() {
		let two_lines = |a, b| vec![tok(a, 1), nl(), tok(b, 1)];
		let mut e = Engine::new(&[two_lines(1, 2), vec![nl(), nl(), tok(1, 1), nl(), tok(2, 1)]], Options { stagger: 1.0, ..OPTS });
		let mid = code(&mut e, 1.4);
		let (top, bottom) = (mid.iter().find(|i| i.text == 1).unwrap(), mid.iter().find(|i| i.text == 2).unwrap());
		assert!(top.y - 0.0 > bottom.y - 20.0, "top {} bottom {}", top.y, bottom.y);
	}

	#[test]
	fn evaluate_is_deterministic_in_any_order() {
		let opts = Options { stagger: 0.5, gutter_color: Some(1), ..OPTS };
		let mut e = Engine::new(&[vec![tok(1, 1)], vec![tok(2, 1), tok(1, 1)], vec![tok(1, 1)]], opts);
		let forward: Vec<_> = (0..50).map(|f| e.evaluate(f as f32 / 10.0).to_vec()).collect();
		for f in (0..50).rev() {
			assert_eq!(e.evaluate(f as f32 / 10.0), forward[f].as_slice());
		}
	}

	#[test]
	fn color_lerps_per_channel() {
		assert_eq!(lerp_color(0x000000ff, 0xff0000ff, 0.5), 0x800000ff);
		assert_eq!(lerp_color(0x12345678, 0x12345678, 0.3), 0x12345678);
	}

	#[test]
	fn instance_layout_matches_js() {
		// app/lib/engine/index.ts reads instances as six 4-byte words and hardcodes these values.
		assert_eq!(std::mem::size_of::<Instance>(), 24);
		assert_eq!((KIND_TEXT, KIND_SPACE, KIND_NEWLINE, STYLE_LINE_NUMBER), (0, 1, 2, 256));
	}

	#[test]
	fn decode_rejects_malformed_input() {
		let data = [2, 1, 7, 0xff, 0, 3, KIND_TEXT, 0];
		let slides = decode(&data).unwrap();
		assert_eq!(slides, vec![vec![Token { text: 7, color: 0xff, style: 0, cols: 3, kind: KIND_TEXT }], vec![]]);
		assert!(decode(&data[..5]).is_none(), "truncated");
		assert!(decode(&[1, 0, 9]).is_none(), "trailing data");
		assert!(decode(&[]).is_none(), "empty");
	}
}
