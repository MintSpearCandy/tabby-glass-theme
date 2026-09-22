declare module '*.scss' {
    const content: string
    export default content
}

// tabby-terminal 运行时由 Tabby 宿主提供 (webpack external), 此处仅为编译期类型声明.
// 注意: 不能对 'tabby-core' 做同样的 declare module —— 那会整体遮蔽其真实 typings.
declare module 'tabby-terminal' {
    export abstract class TerminalColorSchemeProvider {
        abstract getSchemes (): Promise<any[]>
    }
}

// tabby-settings 同理: 运行时由宿主提供 (webpack external), 仅编译期类型
declare module 'tabby-settings' {
    export abstract class SettingsTabProvider {
        id: string
        icon: string
        title: string
        weight: number
        prioritized: boolean
        getComponentType (): any
    }
}
