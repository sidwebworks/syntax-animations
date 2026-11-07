//! Code animation engine.
//!
//! Animation is a pure function of time: `Engine::evaluate(t)` says where every token
//! is, what color it is and how visible it is at `t`. No frame depends on the one
//! before it, so frames can be rendered in any order (scrubbing, offline export).
//!
//! The engine never sees text. JS interns each token's string to an id and says how
//! many monospace columns it spans; the engine hands the ids back.

use std::ops::Range;

use similar::{capture_diff_slices, Algorithm, DiffOp};

const KIND_TEXT: u32 = 0;
const KIND_SPACE: u32 = 1;
const KIND_NEWLINE: u32 = 2;

/// Set on instances that are line numbers. Their `text` is the number itself.
const STYLE_LINE_NUMBER: u32 = 1 << 8;
/// Set on the typing cursor.
const STYLE_CURSOR: u32 = 1 << 9;

/// Gap between line numbers and code, in columns.
const GUTTER_GAP: u32 = 2;
/// With full stagger, the last line starts this far into the transition.
const MAX_LAG: f32 = 0.4;
/// `Instance::reveal` for a fully shown token.
const ALL: f32 = f32::INFINITY;
/// Opacity of lines outside a slide's focus.
const DIM: f32 = 0.3;
/// Columns per second when typing new code in.
const TYPING_SPEED: f32 = 40.0;
/// Share of a typing transition's base duration spent moving code before typing starts.
const TYPE_START: f32 = 0.45;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Token {
	pub text: u32,
	/// 0xRRGGBBAA
	pub color: u32,
	pub style: u32,
	pub cols: u32,
	pub kind: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SlideInput {
	/// Overrides `Options::hold` for this slide.
	pub hold: Option<f32>,
	/// Inclusive, 0-based line ranges to keep bright. Empty means every line.
	pub focus: Vec<(u32, u32)>,
	pub tokens: Vec<Token>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Placed {
	text: u32,
	color: u32,
	style: u32,
	line: u32,
	col: u32,
	cols: u32,
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
	/// Columns typed so far, or infinity when the token is complete. On the cursor, the
	/// columns typed of the token in `text`.
	pub reveal: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct Options {
	pub char_w: f32,
	pub line_h: f32,
	/// Seconds each slide stays still, unless the slide overrides it.
	pub hold: f32,
	/// Seconds each transition takes. Typing can stretch it.
	pub transition: f32,
	/// 0 moves every line at once, 1 sweeps top to bottom.
	pub stagger: f32,
	/// `None` hides line numbers.
	pub gutter_color: Option<u32>,
	/// `Some(cursor color)` types new code in instead of fading it.
	pub typing: Option<u32>,
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
	hold: f32,
	focus: Vec<(u32, u32)>,
}

impl Slide {
	fn dim(&self, line: u32) -> f32 {
		if self.focus.is_empty() || self.focus.iter().any(|&(a, b)| (a..=b).contains(&line)) {
			1.0
		} else {
			DIM
		}
	}
}

/// The animation from one slide to the next.
struct Transition {
	pairs: Vec<Pair>,
	duration: f32,
	/// For typing: entering tokens of the next slide in reading order, with the column
	/// count typed before each one starts.
	typed: Vec<(usize, u32)>,
	/// `typed` start columns indexed by token, for lookup per frame.
	typed_start: Vec<u32>,
	typed_cols: u32,
}

pub struct Engine {
	opts: Options,
	slides: Vec<Slide>,
	/// `transitions[i]` goes from slide `i` to slide `i + 1`.
	transitions: Vec<Transition>,
	/// When each slide's hold starts.
	starts: Vec<f32>,
	lines: u32,
	cols: u32,
	gutter: u32,
	out: Vec<Instance>,
}

impl Engine {
	pub fn new(slides: &[SlideInput], opts: Options) -> Self {
		let slides: Vec<Slide> = slides.iter().map(|s| layout(s, opts.hold)).collect();
		let lines = slides.iter().map(|s| s.lines).max().unwrap_or(0);
		let cols = slides.iter().map(|s| s.cols).max().unwrap_or(0);
		let gutter = match opts.gutter_color {
			Some(_) => digits(lines) + GUTTER_GAP,
			None => 0,
		};

		let transitions: Vec<Transition> = slides
			.windows(2)
			.map(|w| {
				let pairs = match_tokens(&w[0].tokens, &w[1].tokens);
				let mut entering: Vec<usize> = pairs.iter().filter_map(|p| if let Pair::Enter(b) = *p { Some(b) } else { None }).collect();
				entering.sort_by_key(|&b| (w[1].tokens[b].line, w[1].tokens[b].col));
				let mut typed_cols = 0;
				let typed: Vec<(usize, u32)> = entering
					.into_iter()
					.map(|b| {
						let start = typed_cols;
						typed_cols += w[1].tokens[b].cols;
						(b, start)
					})
					.collect();
				let mut typed_start = vec![0; w[1].tokens.len()];
				for &(b, start) in &typed {
					typed_start[b] = start;
				}
				// Typing gets as long as the text needs; moving code before it keeps its pace.
				let duration = match opts.typing {
					Some(_) => opts.transition.max(opts.transition * TYPE_START + typed_cols as f32 / TYPING_SPEED),
					None => opts.transition,
				};
				Transition { pairs, duration, typed, typed_start, typed_cols }
			})
			.collect();

		let mut starts = Vec::with_capacity(slides.len());
		let mut t = 0.0;
		for (i, s) in slides.iter().enumerate() {
			starts.push(t);
			t += s.hold + transitions.get(i).map_or(0.0, |tr| tr.duration);
		}

		Engine { opts, slides, transitions, starts, lines, cols, gutter, out: Vec::new() }
	}

	pub fn duration(&self) -> f32 {
		match (self.starts.last(), self.slides.last()) {
			(Some(start), Some(slide)) => start + slide.hold,
			_ => 0.0,
		}
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

		let Options { char_w, line_h, .. } = self.opts;
		let t = t.clamp(0.0, self.duration());
		let i = self.starts.partition_point(|&s| s <= t).saturating_sub(1);
		let local = t - self.starts[i];
		let x0 = self.gutter as f32 * char_w;
		let at = |p: &Placed| (x0 + p.col as f32 * char_w, p.line as f32 * line_h);
		let gutter = self.opts.gutter_color.map(|color| (color, digits(self.lines)));
		let out = &mut self.out;
		let a = &self.slides[i];

		if local <= a.hold || i == self.slides.len() - 1 {
			for p in &a.tokens {
				let (x, y) = at(p);
				out.push(Instance { text: p.text, color: p.color, style: p.style, x, y, alpha: a.dim(p.line), reveal: ALL });
			}
			push_line_numbers(out, &self.opts, gutter, a.lines, |line| a.dim(line));
			return out;
		}

		let tr = &self.transitions[i];
		let b = &self.slides[i + 1];
		let elapsed = local - a.hold;
		let typing = self.opts.typing.is_some();
		// `p` drives fades and moves. When typing, they run in a fixed lead-in and the rest is typing.
		let (p, typed) = if typing {
			let lead = self.opts.transition * TYPE_START;
			let typing_time = (tr.duration - lead).max(1e-3);
			let typed = ((elapsed - lead) / typing_time).clamp(0.0, 1.0) * tr.typed_cols as f32;
			((elapsed / lead).clamp(0.0, 1.0), typed)
		} else {
			((elapsed / tr.duration).clamp(0.0, 1.0), 0.0)
		};
		let lag = lag(self.opts.stagger, a.lines.max(b.lines));

		// Leaving tokens fade first, matched tokens glide, new ones arrive last.
		let leave = |line| 1.0 - ease_out(phase(lag(p, line), 0.0, 0.35));
		let glide = |line| smootherstep(phase(lag(p, line), 0.1, if typing { 1.0 } else { 0.9 }));
		let enter = |line| ease_out(phase(lag(p, line), 0.6, 1.0));

		for pair in &tr.pairs {
			let inst = match *pair {
				Pair::Leave(ai) => {
					let t = &a.tokens[ai];
					let (x, y) = at(t);
					Instance { text: t.text, color: t.color, style: t.style, x, y, alpha: leave(t.line) * a.dim(t.line), reveal: ALL }
				}
				Pair::Enter(bi) if typing => {
					let t = &b.tokens[bi];
					let (x, y) = at(t);
					let done = (typed - tr.typed_start[bi] as f32).floor().clamp(0.0, t.cols as f32);
					let reveal = if done >= t.cols as f32 { ALL } else { done };
					Instance { text: t.text, color: t.color, style: t.style, x, y, alpha: b.dim(t.line), reveal }
				}
				Pair::Enter(bi) => {
					let t = &b.tokens[bi];
					let (x, y) = at(t);
					let e = enter(t.line);
					Instance {
						text: t.text,
						color: t.color,
						style: t.style,
						x,
						y: y + (1.0 - e) * line_h * 0.3,
						alpha: e * b.dim(t.line),
						reveal: ALL,
					}
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
						alpha: lerp(a.dim(from.line), b.dim(to.line), g),
						reveal: ALL,
					}
				}
			};
			if inst.alpha > 0.001 && inst.reveal > 0.0 {
				out.push(inst);
			}
		}

		// The cursor sits after the last character typed so far. JS places it, since only JS
		// knows where character boundaries fall inside the token.
		if let (Some(color), true) = (self.opts.typing, typed > 0.0 && typed < tr.typed_cols as f32) {
			if let Some(&(bi, start)) = tr.typed.iter().rev().find(|&&(_, s)| (s as f32) < typed) {
				let t = &b.tokens[bi];
				let (x, y) = at(t);
				let done = (typed - start as f32).floor().min(t.cols as f32);
				out.push(Instance { text: t.text, color, style: STYLE_CURSOR, x, y, alpha: 1.0, reveal: done });
			}
		}

		// Numbers for lines only one side has fade with the code on them.
		let shared = a.lines.min(b.lines);
		push_line_numbers(out, &self.opts, gutter, a.lines.max(b.lines), |line| {
			let dim = match (line < a.lines, line < b.lines) {
				(true, true) => lerp(a.dim(line), b.dim(line), glide(line)),
				(true, false) => a.dim(line),
				_ => b.dim(line),
			};
			let fade = match (line < shared, a.lines > b.lines) {
				(true, _) => 1.0,
				(false, true) => leave(line),
				(false, false) => enter(line),
			};
			dim * fade
		});
		out
	}
}

/// Line numbers `1..=count`, with the opacity `alpha` gives each 0-based line.
fn push_line_numbers(
	out: &mut Vec<Instance>,
	opts: &Options,
	gutter: Option<(u32, u32)>,
	count: u32,
	alpha: impl Fn(u32) -> f32,
) {
	let Some((color, width)) = gutter else { return };
	for n in 1..=count {
		let alpha = alpha(n - 1);
		if alpha > 0.001 {
			out.push(Instance {
				text: n,
				color,
				style: STYLE_LINE_NUMBER,
				x: (width - digits(n)) as f32 * opts.char_w,
				y: (n - 1) as f32 * opts.line_h,
				alpha,
				reveal: ALL,
			});
		}
	}
}

/// Progress of a transition for one line, delayed by its position when staggered.
fn lag(stagger: f32, lines: u32) -> impl Fn(f32, u32) -> f32 {
	let span = stagger.clamp(0.0, 1.0) * MAX_LAG;
	let last = lines.saturating_sub(1).max(1) as f32;
	move |p, line| ((p - span * line as f32 / last) / (1.0 - span)).clamp(0.0, 1.0)
}

fn layout(input: &SlideInput, default_hold: f32) -> Slide {
	let (mut line, mut col, mut cols) = (0, 0, 0);
	let mut tokens = Vec::new();
	for t in &input.tokens {
		match t.kind {
			KIND_NEWLINE => {
				line += 1;
				col = 0;
				continue;
			}
			KIND_TEXT => tokens.push(Placed { text: t.text, color: t.color, style: t.style, line, col, cols: t.cols }),
			KIND_SPACE => {}
			_ => continue,
		}
		col += t.cols;
		cols = cols.max(col);
	}
	Slide { tokens, lines: line + 1, cols, hold: input.hold.unwrap_or(default_hold).max(0.0), focus: input.focus.clone() }
}

/// Lines are matched first, so a token never jumps to an unrelated line just because
/// its text repeats there. Tokens inside changed lines are then diffed, and leftover
/// removed/added tokens with the same text are paired so moved code glides instead of
/// fading out and back in.
fn match_tokens(a: &[Placed], b: &[Placed]) -> Vec<Pair> {
	let (la, lb) = (line_ranges(a), line_ranges(b));
	let key = |ts: &[Placed], r: &Range<usize>| ts[r.clone()].iter().map(|p| p.text).collect::<Vec<u32>>();
	let ka: Vec<Vec<u32>> = la.iter().map(|r| key(a, r)).collect();
	let kb: Vec<Vec<u32>> = lb.iter().map(|r| key(b, r)).collect();

	let span = |lines: &[Range<usize>], r: Range<usize>| match (lines.get(r.start), r.end.checked_sub(1).and_then(|e| lines.get(e))) {
		(Some(first), Some(last)) if !r.is_empty() => first.start..last.end,
		_ => 0..0,
	};

	let mut pairs = Vec::with_capacity(a.len().max(b.len()));
	for op in capture_diff_slices(Algorithm::Patience, &ka, &kb) {
		if let DiffOp::Equal { old_index, new_index, len } = op {
			for k in 0..len {
				pairs.extend(la[old_index + k].clone().zip(lb[new_index + k].clone()).map(|(x, y)| Pair::Move(x, y)));
			}
		} else {
			let (ra, rb) = (span(&la, op.old_range()), span(&lb, op.new_range()));
			diff_tokens(&a[ra.clone()], &b[rb.clone()], ra.start, rb.start, &mut pairs);
		}
	}

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
	let mut unpaired = vec![false; a.len()];
	for &ai in &leaving {
		unpaired[ai] = true;
	}
	pairs.retain(|p| !matches!(p, Pair::Leave(ai) if !unpaired[*ai]));
	pairs
}

/// Token index ranges for each line that has tokens, in order.
fn line_ranges(ts: &[Placed]) -> Vec<Range<usize>> {
	let mut out: Vec<Range<usize>> = Vec::new();
	for (i, t) in ts.iter().enumerate() {
		match out.last_mut() {
			Some(r) if ts[r.start].line == t.line => r.end = i + 1,
			_ => out.push(i..i + 1),
		}
	}
	out
}

fn diff_tokens(a: &[Placed], b: &[Placed], ao: usize, bo: usize, pairs: &mut Vec<Pair>) {
	let ka: Vec<u32> = a.iter().map(|p| p.text).collect();
	let kb: Vec<u32> = b.iter().map(|p| p.text).collect();
	for op in capture_diff_slices(Algorithm::Patience, &ka, &kb) {
		match op {
			DiffOp::Equal { old_index, new_index, len } => {
				pairs.extend((0..len).map(|k| Pair::Move(ao + old_index + k, bo + new_index + k)))
			}
			op => {
				pairs.extend(op.old_range().map(|i| Pair::Leave(ao + i)));
				pairs.extend(op.new_range().map(|i| Pair::Enter(bo + i)));
			}
		}
	}
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

/// Decodes
/// `[slide_count, (hold, focus_count, (start, end) * focus_count, token_count, (text, color, style, cols, kind) * token_count) * slide_count]`.
/// `hold` is f32 bits; a negative value means "use the default".
/// Malformed input returns `None`: a panic would abort the whole Wasm instance.
fn decode(data: &[u32]) -> Option<Vec<SlideInput>> {
	let mut it = data.iter().copied();
	let slides = it.next()? as usize;
	let mut out = Vec::with_capacity(slides.min(4096));
	for _ in 0..slides {
		let hold = f32::from_bits(it.next()?);
		let hold = (hold.is_finite() && hold >= 0.0).then_some(hold);
		let ranges = it.next()? as usize;
		let mut focus = Vec::with_capacity(ranges.min(1024));
		for _ in 0..ranges {
			focus.push((it.next()?, it.next()?));
		}
		let n = it.next()? as usize;
		let mut tokens = Vec::with_capacity(n.min(1 << 20));
		for _ in 0..n {
			let (text, color, style, cols, kind) = (it.next()?, it.next()?, it.next()?, it.next()?, it.next()?);
			tokens.push(Token { text, color, style, cols, kind });
		}
		out.push(SlideInput { hold, focus, tokens });
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

	/// Returns null if the input is malformed. A color of 0 turns line numbers or typing off.
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
		cursor_color: u32,
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
			typing: (cursor_color != 0).then_some(cursor_color),
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

	const OPTS: Options =
		Options { char_w: 10.0, line_h: 20.0, hold: 1.0, transition: 1.0, stagger: 0.0, gutter_color: None, typing: None };

	fn tok(text: u32, cols: u32) -> Token {
		Token { text, color: 0xffffffff, style: 0, cols, kind: KIND_TEXT }
	}
	fn space(cols: u32) -> Token {
		Token { kind: KIND_SPACE, ..tok(0, cols) }
	}
	fn nl() -> Token {
		Token { kind: KIND_NEWLINE, ..tok(0, 0) }
	}
	fn slide(tokens: Vec<Token>) -> SlideInput {
		SlideInput { hold: None, focus: vec![], tokens }
	}
	fn engine(slides: Vec<Vec<Token>>, opts: Options) -> Engine {
		Engine::new(&slides.into_iter().map(slide).collect::<Vec<_>>(), opts)
	}
	fn code(e: &mut Engine, t: f32) -> Vec<Instance> {
		e.evaluate(t).iter().filter(|i| i.style & (STYLE_LINE_NUMBER | STYLE_CURSOR) == 0).copied().collect()
	}
	fn numbers(e: &mut Engine, t: f32) -> Vec<(u32, f32)> {
		e.evaluate(t).iter().filter(|i| i.style & STYLE_LINE_NUMBER != 0).map(|i| (i.text, i.alpha)).collect()
	}
	fn code_only(frame: &[Instance]) -> Vec<Instance> {
		frame.iter().filter(|i| i.style & (STYLE_LINE_NUMBER | STYLE_CURSOR) == 0).copied().collect()
	}
	fn find(frame: &[Instance], text: u32) -> Instance {
		*frame.iter().find(|i| i.text == text).unwrap_or_else(|| panic!("no token {text} in {frame:?}"))
	}

	#[test]
	fn layout_places_tokens_on_grid() {
		// "ab cd\n  ef"
		let s = layout(&slide(vec![tok(1, 2), space(1), tok(2, 2), nl(), space(2), tok(3, 2)]), 1.0);
		let pos: Vec<_> = s.tokens.iter().map(|p| (p.text, p.line, p.col)).collect();
		assert_eq!(pos, [(1, 0, 0), (2, 0, 3), (3, 1, 2)]);
		assert_eq!((s.lines, s.cols), (2, 5));
	}

	#[test]
	fn empty_slide_is_one_line() {
		assert_eq!(layout(&slide(vec![]), 1.0).lines, 1);
	}

	#[test]
	fn holds_show_each_slide_exactly() {
		let mut e = engine(vec![vec![tok(1, 3)], vec![nl(), tok(1, 3), space(1), tok(2, 1)]], OPTS);
		assert_eq!(e.duration(), 3.0);

		let start = code(&mut e, 0.5);
		assert_eq!(start.len(), 1);
		assert_eq!((start[0].x, start[0].y, start[0].alpha), (0.0, 0.0, 1.0));

		let end: Vec<_> = code(&mut e, 3.0).iter().map(|i| (i.text, i.x, i.y, i.alpha)).collect();
		assert_eq!(end, [(1, 0.0, 20.0, 1.0), (2, 40.0, 20.0, 1.0)]);
	}

	#[test]
	fn slides_can_override_hold() {
		let slides = [SlideInput { hold: Some(3.0), ..slide(vec![tok(1, 1)]) }, slide(vec![tok(2, 1)])];
		let mut e = Engine::new(&slides, OPTS);
		assert_eq!(e.duration(), 5.0);
		assert_eq!(code(&mut e, 2.9)[0].text, 1, "still holding the first slide");
		assert_eq!(code(&mut e, 4.5)[0].text, 2);
	}

	#[test]
	fn transition_moves_matched_and_fades_new_tokens() {
		let mut e = engine(vec![vec![tok(1, 3)], vec![nl(), tok(1, 3), space(1), tok(2, 1)]], OPTS);

		let mid = code(&mut e, 1.5);
		let moved = find(&mid, 1);
		assert!(moved.y > 0.0 && moved.y < 20.0, "y = {}", moved.y);
		assert!(mid.iter().all(|i| i.text != 2));

		let entering = find(&code(&mut e, 1.9), 2);
		assert!(entering.alpha > 0.0 && entering.alpha < 1.0);
	}

	#[test]
	fn removed_tokens_fade_out() {
		let mut e = engine(vec![vec![tok(1, 1), tok(2, 1)], vec![tok(1, 1)]], OPTS);
		let leaving = find(&code(&mut e, 1.1), 2);
		assert!(leaving.alpha < 1.0 && leaving.alpha > 0.0);
		assert!(code(&mut e, 1.5).iter().all(|i| i.text != 2));
	}

	#[test]
	fn reordered_tokens_glide_instead_of_fading() {
		let mut e = engine(vec![vec![tok(1, 1), space(1), tok(2, 1)], vec![tok(2, 1), space(1), tok(1, 1)]], OPTS);
		let mid = code(&mut e, 1.5);
		assert_eq!(mid.len(), 2, "both tokens stay visible: {mid:?}");
		assert!(mid.iter().all(|i| i.alpha == 1.0 && i.x > 0.0 && i.x < 20.0));
	}

	#[test]
	fn unchanged_lines_keep_their_tokens() {
		// `x ;` / `y ;` with a new line inserted between: the `;`s must not swap lines.
		let a = vec![tok(1, 1), tok(9, 1), nl(), tok(2, 1), tok(9, 1)];
		let b = vec![tok(1, 1), tok(9, 1), nl(), tok(3, 1), tok(9, 1), nl(), tok(2, 1), tok(9, 1)];
		let mut e = engine(vec![a, b], OPTS);
		let end = code(&mut e, 3.0);
		let semis: Vec<f32> = end.iter().filter(|i| i.text == 9).map(|i| i.y).collect();
		assert_eq!(semis, [0.0, 20.0, 40.0]);

		let mid = code(&mut e, 1.5);
		let first_semi = mid.iter().filter(|i| i.text == 9).map(|i| i.y).fold(f32::MAX, f32::min);
		assert_eq!(first_semi, 0.0, "line 0 is unchanged, so its `;` stays put");
	}

	#[test]
	fn focus_dims_other_lines() {
		let tokens = vec![tok(1, 1), nl(), tok(2, 1), nl(), tok(3, 1)];
		let slides = [SlideInput { focus: vec![(1, 1)], ..slide(tokens) }];
		let mut e = Engine::new(&slides, Options { gutter_color: Some(1), ..OPTS });
		let frame = code(&mut e, 0.0);
		assert_eq!(find(&frame, 1).alpha, DIM);
		assert_eq!(find(&frame, 2).alpha, 1.0);
		assert_eq!(numbers(&mut e, 0.0), [(1, DIM), (2, 1.0), (3, DIM)]);
	}

	#[test]
	fn focus_change_fades_between_slides() {
		let tokens = vec![tok(1, 1), nl(), tok(2, 1)];
		let slides = [slide(tokens.clone()), SlideInput { focus: vec![(1, 1)], ..slide(tokens) }];
		let mut e = Engine::new(&slides, OPTS);
		let mid = find(&code(&mut e, 1.5), 1).alpha;
		assert!(mid < 1.0 && mid > DIM, "alpha {mid}");
	}

	#[test]
	fn typing_reveals_new_code_in_reading_order() {
		let opts = Options { typing: Some(0xffffffff), ..OPTS };
		let b = vec![tok(1, 4), nl(), tok(2, 4)];
		let mut e = engine(vec![vec![], b], opts);
		// 8 typed columns fit in the default 1s transition.
		assert_eq!(e.duration(), 3.0);

		// 2 of 8 columns typed: half of the first word.
		let (lead, typing_time) = (TYPE_START, 1.0 - TYPE_START);
		let frame = e.evaluate(1.0 + lead + typing_time * 0.25 + 1e-4).to_vec();
		assert_eq!(find(&code_only(&frame), 1).reveal, 2.0);
		assert!(code_only(&frame).iter().all(|i| i.text != 2), "second word not started");
		let cursor = frame.iter().find(|i| i.style & STYLE_CURSOR != 0).expect("cursor while typing");
		assert_eq!((cursor.text, cursor.x, cursor.y, cursor.reveal), (1, 0.0, 0.0, 2.0));

		assert!(code(&mut e, 3.0).iter().all(|i| i.reveal == ALL));
	}

	#[test]
	fn typing_slows_down_for_long_code() {
		let opts = Options { typing: Some(1), ..OPTS };
		let long = vec![tok(1, 400)];
		let e = engine(vec![vec![], long], opts);
		let expected = TYPE_START + 400.0 / TYPING_SPEED;
		assert!((e.duration() - (2.0 + expected)).abs() < 1e-3, "duration {}", e.duration());
	}

	#[test]
	fn line_numbers_shift_code_and_fade_with_their_lines() {
		let opts = Options { gutter_color: Some(0x888888ff), ..OPTS };
		let ten_lines: Vec<Token> = (0..10).flat_map(|_| [tok(1, 1), nl()]).take(19).collect();
		let mut e = engine(vec![vec![tok(1, 1)], ten_lines], opts);

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
		let two_lines = vec![tok(1, 1), nl(), tok(2, 1)];
		let moved_down = vec![nl(), nl(), tok(1, 1), nl(), tok(2, 1)];
		let mut e = engine(vec![two_lines, moved_down], Options { stagger: 1.0, ..OPTS });
		let mid = code(&mut e, 1.4);
		let (top, bottom) = (find(&mid, 1), find(&mid, 2));
		assert!(top.y > bottom.y - 20.0, "top {} bottom {}", top.y, bottom.y);
	}

	#[test]
	fn evaluate_is_deterministic_in_any_order() {
		let opts = Options { stagger: 0.5, gutter_color: Some(1), typing: Some(1), ..OPTS };
		let mut e = engine(vec![vec![tok(1, 1)], vec![tok(2, 1), tok(1, 1)], vec![tok(1, 1)]], opts);
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
		// app/lib/engine/index.ts reads instances as seven 4-byte words and hardcodes these values.
		assert_eq!(std::mem::size_of::<Instance>(), 28);
		assert_eq!(
			(KIND_TEXT, KIND_SPACE, KIND_NEWLINE, STYLE_LINE_NUMBER, STYLE_CURSOR),
			(0, 1, 2, 256, 512)
		);
	}

	#[test]
	fn decode_reads_slide_options_and_rejects_malformed_input() {
		let hold = 2.5f32.to_bits();
		let default = (-1.0f32).to_bits();
		let data = [2, hold, 1, 3, 4, 1, 7, 0xff, 0, 3, KIND_TEXT, default, 0, 0];
		let slides = decode(&data).unwrap();
		assert_eq!(
			slides,
			vec![
				SlideInput {
					hold: Some(2.5),
					focus: vec![(3, 4)],
					tokens: vec![Token { text: 7, color: 0xff, style: 0, cols: 3, kind: KIND_TEXT }]
				},
				SlideInput { hold: None, focus: vec![], tokens: vec![] },
			]
		);
		assert!(decode(&data[..9]).is_none(), "truncated");
		assert!(decode(&[1, default, 0, 0, 9]).is_none(), "trailing data");
		assert!(decode(&[]).is_none(), "empty");
	}
}
