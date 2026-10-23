import { Component, Input } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

export interface Snippet {
    name: string
    text: string
}

/** @hidden */
@Component({
    templateUrl: './snippetsModal.component.pug',
})
export class SnippetsModalComponent {
    @Input() snippets: Snippet[]

    constructor (private modalInstance: NgbActiveModal) { }

    add (): void {
        this.snippets.push({ name: '', text: '' })
    }

    remove (index: number): void {
        this.snippets.splice(index, 1)
    }

    move (index: number, delta: number): void {
        const target = index + delta
        if (target < 0 || target >= this.snippets.length) {
            return
        }
        const [snippet] = this.snippets.splice(index, 1)
        this.snippets.splice(target, 0, snippet)
    }

    save (): void {
        this.modalInstance.close(this.snippets
            .map(x => ({ name: x.name.trim() || x.text.trim().slice(0, 20), text: x.text }))
            .filter(x => x.text.trim()))
    }

    cancel (): void {
        this.modalInstance.dismiss()
    }
}
