import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
	selector: 'app-group-avatar-layout',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './groupAvatarLayout.component.html',
	styleUrls: ['./groupAvatarLayout.component.css']
})
export class GroupAvatarLayoutComponent {
	@Input() members: any[] = [];
	@Input() avatarUrl: string | null = null;
	@Input() alt = 'Avatar';
	@Input() isGroup = false;
	@Input() size = 112;

	get hasAvatarUrl(): boolean {
		return !!this.avatarUrl;
	}

	get memberAvatars(): any[] {
		if (!this.isGroup) return [];
		return (this.members || []).filter((m: any) => !!m?.avatar_url).slice(0, 3);
	}

	get memberCount(): number {
		return (this.members || []).length;
	}

	get isThreeLayout(): boolean {
		return this.memberCount <= 3;
	}

	get isFourPlusLayout(): boolean {
		return this.memberCount >= 4;
	}

	get extraCount(): number {
		return Math.max(0, this.memberCount - 3);
	}

	get cssSizePx(): string {
		return `${this.size}px`;
	}
}
