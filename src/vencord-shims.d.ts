// Type shims so this plugin's source type-checks outside of a Vencord checkout.
// When this folder is dropped into Vencord/src/userplugins/, Vencord's real
// type roots win and these shims are harmless. Keep this file as a pure
// declaration script (no top-level imports/exports) so ambient module
// declarations stay global.

declare module "@api/DataStore" {
    export function get<T = unknown>(key: string): Promise<T | undefined>;
    export function set(key: string, value: unknown): Promise<void>;
    export function del(key: string): Promise<void>;
}

declare module "@api/ContextMenu" {
    export type NavContextMenuPatchCallback = (
        children: any[],
        props: any,
    ) => void | Promise<void>;
    export function addContextMenuPatch(navId: string | string[], patch: NavContextMenuPatchCallback): void;
    export function removeContextMenuPatch(navId: string | string[], patch: NavContextMenuPatchCallback): void;
    export function findGroupChildrenByChildId(id: string | string[], children: any[]): any[] | undefined;
}

declare module "@api/Commands" {
    export const ApplicationCommandInputType: {
        BUILT_IN: number;
        BUILT_IN_TEXT: number;
        BOT: number;
    };
    export function sendBotMessage(channelId: string, message: any): void;
}

declare module "@utils/modal" {
    export interface ModalProps {
        transitionState: number;
        onClose: () => void;
    }
    export const ModalSize: { SMALL: string; MEDIUM: string; LARGE: string; DYNAMIC: string };
    export const ModalRoot: any;
    export const ModalHeader: any;
    export const ModalContent: any;
    export const ModalFooter: any;
    export const ModalCloseButton: any;
    export function openModal(render: (props: ModalProps) => any): string;
    export function closeModal(key: string): void;
}

declare module "@utils/types" {
    const definePlugin: (plugin: any) => any;
    export default definePlugin;
}

declare module "@utils/constants" {
    export const Devs: Record<string, { name: string; id: bigint }>;
}

declare module "@webpack/common" {
    export const Menu: any;
    export const Button: any;
    export const Text: any;
    export const NavigationRouter: { transitionTo: (path: string) => void };
    export const ChannelStore: { getChannel(id: string): any };
    export const GuildStore: { getGuild(id: string): any };
    export const ReadStateStore: any;
    export const React: any;
}

declare module "react" {
    const _default: any;
    export = _default;
}

declare namespace JSX {
    interface IntrinsicElements {
        [elem: string]: any;
    }
    interface Element {
        [key: string]: any;
    }
    interface ElementClass {
        [key: string]: any;
    }
}
