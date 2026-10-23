import { Injectable } from '@angular/core'
import { Observable, Subject } from 'rxjs'

/**
 * What the assistant running in a terminal is doing, as far as Tsugite can tell from outside:
 * the terminal title it sets (an idle or a spinner glyph followed by the task title) and the
 * prompts visible on screen.
 */
export type AssistState = 'starting' | 'working' | 'waiting' | 'idle' | 'ended'

export interface AssistActivity {
    state: AssistState
    task: string
    since: number
}

/** Shares the state of every assisted terminal tab, keyed by the machine it runs on, with the side panel */
@Injectable({ providedIn: 'root' })
export class AssistActivityService {
    get changed$ (): Observable<void> { return this.changed }

    private activities = new Map<string, Map<object, AssistActivity>>()
    private changed = new Subject<void>()

    update (key: string, owner: object, activity: AssistActivity | null): void {
        let byOwner = this.activities.get(key)
        if (!byOwner) {
            byOwner = new Map()
            this.activities.set(key, byOwner)
        }
        if (activity) {
            byOwner.set(owner, activity)
        } else {
            byOwner.delete(owner)
        }
        this.changed.next()
    }

    /** The most urgent state among the tabs open on a machine */
    get (key: string): AssistState | null {
        const states = [...this.activities.get(key)?.values() ?? []].map(x => x.state)
        for (const state of ['waiting', 'working', 'idle', 'starting'] as AssistState[]) {
            if (states.includes(state)) {
                return state
            }
        }
        return null
    }
}
