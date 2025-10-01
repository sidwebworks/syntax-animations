import type { ComponentProps } from "react";
import type { ShikiMagicMove } from "~/components/ShikiRenderer";

export type MoveOptions = ComponentProps<typeof ShikiMagicMove>["options"];

export type JSTypeofResult = "undefined" | "object" | "boolean" | "number" | "bigint" | "string" | "symbol" | "function";