import { Component, Output, EventEmitter, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import packageInfo from '../../../../package.json';
import { ActiveConversationService } from '../../services/activeConversation.service';

@Component({
  selector: 'app-intro-layout',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './introLayout.component.html',
  styleUrls: ['./introLayout.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IntroLayoutComponent {
  private convStore = inject(ActiveConversationService);
  version = packageInfo.version;

  hasConversations = computed(() => this.convStore.joinedConversations().length > 0);
  @Output() startNewConversation = new EventEmitter<void>();

  handleStart() {
    this.startNewConversation.emit();
  }
}
