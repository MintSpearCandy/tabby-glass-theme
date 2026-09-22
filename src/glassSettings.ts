import { Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'

import { GlassSettingsTabComponent } from './glassSettingsTab.component'

/** @hidden */
@Injectable()
export class GlassSettingsTabProvider extends SettingsTabProvider {
    id = 'glass-theme'
    icon = 'image'
    title = 'Glass Theme'
    weight = 5

    getComponentType (): any {
        return GlassSettingsTabComponent
    }
}
