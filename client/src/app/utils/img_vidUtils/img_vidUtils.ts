import { FileUtils } from '../FileUtils/fileUltils';

export type MediaViewerType = 'image' | 'video';

export class ImgVidUtils {
	isOpen = false;
	type: MediaViewerType = 'image';
	items: string[] = [];
	currentIndex = 0;

	zoom = 1;
	readonly zoomMin = 0.5;
	readonly zoomMax = 3;
	readonly zoomStep = 0.2;

	panX = 0;
	panY = 0;
	isDragging = false;
	private dragStartX = 0;
	private dragStartY = 0;
	private panStartX = 0;
	private panStartY = 0;

	constructor(private fileUtils: FileUtils) { }

	get mediaUrl(): string {
		return this.items[this.currentIndex] || '';
	}

	get canPrev(): boolean {
		return this.currentIndex > 0;
	}

	get canNext(): boolean {
		return this.currentIndex < this.items.length - 1;
	}

	openImageViewer(url: string) {
		this.openGallery('image', [url], 0);
	}

	openVideoViewer(url: string) {
		this.openGallery('video', [url], 0);
	}

	openImageGallery(urls: string[], startIndex = 0) {
		this.openGallery('image', urls, startIndex);
	}

	openVideoGallery(urls: string[], startIndex = 0) {
		this.openGallery('video', urls, startIndex);
	}

	private openGallery(type: MediaViewerType, urls: string[], startIndex = 0) {
		const resolved = urls
			.map(url => this.fileUtils.resolveMediaUrl(url))
			.filter((url): url is string => !!url);

		if (resolved.length === 0) return;

		this.type = type;
		this.items = resolved;
		this.currentIndex = Math.max(0, Math.min(startIndex, resolved.length - 1));
		this.isOpen = true;
		this.resetTransform();
	}

	closeViewer() {
		this.isOpen = false;
		this.type = 'image';
		this.items = [];
		this.currentIndex = 0;
		this.resetTransform();
	}

	next(event?: Event) {
		event?.stopPropagation();
		if (!this.canNext) return;
		this.currentIndex += 1;
		this.resetTransform();
	}

	prev(event?: Event) {
		event?.stopPropagation();
		if (!this.canPrev) return;
		this.currentIndex -= 1;
		this.resetTransform();
	}

	zoomIn(event?: Event) {
		if (this.type !== 'image') return;
		event?.stopPropagation();
		this.zoom = Math.min(this.zoomMax, Number((this.zoom + this.zoomStep).toFixed(2)));
	}

	zoomOut(event?: Event) {
		if (this.type !== 'image') return;
		event?.stopPropagation();
		this.zoom = Math.max(this.zoomMin, Number((this.zoom - this.zoomStep).toFixed(2)));

		if (this.zoom <= 1) {
			this.panX = 0;
			this.panY = 0;
			this.isDragging = false;
		}
	}

	resetTransform(event?: Event) {
		event?.stopPropagation();
		this.zoom = 1;
		this.panX = 0;
		this.panY = 0;
		this.isDragging = false;
	}

	onPointerDown(event: PointerEvent) {
		if (this.type !== 'image' || this.zoom <= 1) return;

		event.stopPropagation();
		event.preventDefault();
		this.isDragging = true;
		this.dragStartX = event.clientX;
		this.dragStartY = event.clientY;
		this.panStartX = this.panX;
		this.panStartY = this.panY;
	}

	onPointerMove(event: PointerEvent) {
		if (this.type !== 'image' || !this.isDragging || this.zoom <= 1) return;

		event.stopPropagation();
		event.preventDefault();
		const deltaX = event.clientX - this.dragStartX;
		const deltaY = event.clientY - this.dragStartY;
		this.panX = this.panStartX + deltaX;
		this.panY = this.panStartY + deltaY;
	}

	onPointerUp(event?: PointerEvent) {
		event?.stopPropagation();
		this.isDragging = false;
	}
}
