import * as React from "react";
import type { KeyedTokensInfo, MagicMoveDifferOptions, MagicMoveRenderOptions } from "shiki-magic-move/types";
import type { HighlighterCore } from "shiki/core";
import { codeToKeyedTokens, createMagicMoveMachine } from "shiki-magic-move/core";
import { MagicMoveRenderer } from "shiki-magic-move/renderer";
import "shiki-magic-move/dist/style.css";
import { useIsomorphicLayoutEffect } from "@dnd-kit/utilities";
import { cn } from "~/lib/utils";

/** Utils */
export function normalizeCSSProperties(css?: string | Record<string, string>): React.CSSProperties {
  if (typeof css === "string") {
    const style: Record<string, string> = {};
    css?.split(";").forEach((pair) => {
      const [key, value] = pair.split(":");
      if (key && value) style[key.trim()] = value.trim();
    });
    return style as React.CSSProperties;
  }
  return css as React.CSSProperties;
}

export interface ShikiMagicMoveProps {
  highlighter: HighlighterCore;
  lang: string;
  theme: string;
  code: string;
  options?: MagicMoveRenderOptions & MagicMoveDifferOptions;
  onStart?: () => void;
  onEnd?: () => void;
  className?: string;
  tabindex?: number;
}

export function ShikiMagicMove(props: ShikiMagicMoveProps) {
  const codeToTokens = React.useRef<(code: string, lineNumbers?: boolean) => KeyedTokensInfo>((code, lineNumbers) =>
    codeToKeyedTokens(
      props.highlighter,
      code,
      {
        lang: props.lang,
        theme: props.theme,
      },
      lineNumbers
    )
  );

  const machine = React.useRef<ReturnType<typeof createMagicMoveMachine>>(null);
  machine.current =
    machine.current || createMagicMoveMachine((code, lineNumbers) => codeToTokens.current!(code, lineNumbers));

  const lineNumbers = props.options?.lineNumbers ?? false;

  const result = React.useMemo(() => {
    if (
      props.code === machine.current!.current.code &&
      props.theme === machine.current!.current.themeName &&
      props.lang === machine.current!.current.lang &&
      lineNumbers === machine.current!.current.lineNumbers
    ) {
      return machine.current!;
    }

    return machine.current!.commit(props.code, props.options);
  }, [props.code, props.options, props.theme, props.lang, lineNumbers]);

  return (
    <ShikiMagicMoveRenderer
      tokens={result.current}
      options={props.options}
      previous={result.previous}
      onStart={props.onStart}
      onEnd={props.onEnd}
      className={props.className}
    />
  );
}

export interface ShikiMagicMoveRendererProps {
  animate?: boolean;
  tokens: KeyedTokensInfo;
  previous?: KeyedTokensInfo;
  options?: MagicMoveRenderOptions;
  onStart?: () => void;
  onEnd?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A wrapper component to `MagicMoveRenderer`
 */
export const ShikiMagicMoveRenderer = React.memo(
  ({ animate = true, tokens, previous, options, onStart, onEnd, className, style }: ShikiMagicMoveRendererProps) => {
    const container = React.useRef<HTMLPreElement>(null);
    const renderer = React.useRef<MagicMoveRenderer>(null);
    const [isMounted, setIsMounted] = React.useState(false);

    useIsomorphicLayoutEffect(() => {
      if (container.current) {
        container.current.innerHTML = "";
        if (!renderer.current) {
          renderer.current = new MagicMoveRenderer(container.current);
          setIsMounted(true);
        }
      }
    }, []);

    React.useEffect(() => {
      const timeout = requestAnimationFrame(() => {
        if (!renderer.current) return;
        Object.assign(renderer.current.options, options);

        const render = async () => {
          if (animate && previous) {
            renderer.current!.replace(previous);
            onStart?.();
            await renderer.current!.render(tokens);
            onEnd?.();
          } else {
            renderer.current!.replace(tokens);
          }
        };

        render();
      });

      return () => cancelAnimationFrame(timeout);
    }, [tokens]);

    return (
      <pre ref={container} className={`shiki-magic-move-container min-h-max h-full ${className || ""}`.trim()} style={style}>
        <div>
          {isMounted
            ? undefined
            : tokens.tokens.map((token) => {
                if (token.content === "\n") return <br key={token.key} />;

                return (
                  <span
                    style={{
                      ...normalizeCSSProperties(token.htmlStyle),
                      color: token.color,
                    }}
                    className={cn("shiki-magic-move-item", token.htmlClass)}
                    key={token.key}
                  >
                    {token.content}
                  </span>
                );
              })}
        </div>
      </pre>
    );
  }
);
