import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Post } from './models/post.model';
import { PostService } from './services/post.service';
import { DeviceService } from './services/device.service';
import { NotificationService } from './services/notification.service';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  private readonly postService = inject(PostService);
  private readonly device = inject(DeviceService);
  private readonly notifications = inject(NotificationService);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('videoPreview') videoRef?: ElementRef<HTMLVideoElement>;

  readonly posts = signal<Post[]>([]);
  readonly modalOpen = signal(false);
  readonly drawerOpen = signal(false);
  readonly cameraActive = signal(false);
  readonly preview = signal<string | SafeUrl>('/main-image.jpg');
  readonly status = signal('');
  readonly snackbar = signal('');
  readonly title = signal('');
  readonly location = signal('');
  readonly loading = signal(true);
  readonly notificationLabel = signal('Habilitar Notificaciones');

  private deferredPrompt: Event | null = null;
  private snackbarTimer?: ReturnType<typeof setTimeout>;

  readonly defaultImage = this.postService.defaultImage;

  ngOnInit(): void {
    this.updateNotificationLabel();
    this.loadPosts();

    window.addEventListener('beforeinstallprompt', this.onBeforeInstallPrompt);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => console.log('[PWA] Service Worker registrado'))
        .catch((err) => console.warn('[PWA] No se pudo registrar el SW', err));
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeinstallprompt', this.onBeforeInstallPrompt);
    this.device.stopCamera(this.videoRef?.nativeElement);
    if (this.snackbarTimer) clearTimeout(this.snackbarTimer);
  }

  private readonly onBeforeInstallPrompt = (event: Event): void => {
    event.preventDefault();
    this.deferredPrompt = event;
  };

  private updateNotificationLabel(): void {
    const labels: Record<string, string> = {
      granted: 'Notificaciones activadas',
      denied: 'Notificaciones bloqueadas',
      unsupported: 'Notificaciones no disponibles',
      default: 'Habilitar Notificaciones',
    };
    this.notificationLabel.set(labels[this.notifications.permission] || labels['default']);
  }

  async loadPosts(): Promise<void> {
    this.loading.set(true);
    const posts = await this.postService.loadPosts();
    this.posts.set(posts);
    this.loading.set(false);
  }

  showSnackbar(message: string): void {
    this.snackbar.set(message);
    if (this.snackbarTimer) clearTimeout(this.snackbarTimer);
    this.snackbarTimer = setTimeout(() => this.snackbar.set(''), 3500);
  }

  imageUrl(url: string): SafeUrl {
    return this.sanitizer.bypassSecurityTrustUrl(url || this.defaultImage);
  }

  private setPreview(url: string): void {
    this.preview.set(this.sanitizer.bypassSecurityTrustUrl(url));
  }

  private resetPhoto(): void {
    this.device.stopCamera(this.videoRef?.nativeElement);
    this.device.resetImage();
    this.cameraActive.set(false);
    this.setPreview('/main-image.jpg');
    this.status.set('');
  }

  openModal(): void {
    this.modalOpen.set(true);
    this.resetPhoto();

    // Mantener el flujo original: el prompt de instalación al abrir el modal.
    if (this.deferredPrompt) {
      const prompt = this.deferredPrompt as Event & {
        prompt: () => void;
        userChoice: Promise<{ outcome: string }>;
      };
      prompt.prompt();
      prompt.userChoice.then((result) => console.log('[PWA] Instalación:', result.outcome));
      this.deferredPrompt = null;
    }
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.resetPhoto();
  }

  toggleDrawer(): void {
    this.drawerOpen.update((value) => !value);
  }

  async enableNotifications(): Promise<void> {
    await this.notifications.enable();
    this.updateNotificationLabel();
  }

  async openCamera(): Promise<void> {
    const video = this.videoRef?.nativeElement;
    if (!video) return;

    if (!this.device.isCameraSupported) {
      this.status.set('Tu navegador no permite usar la cámara. Puedes elegir una foto.');
      return;
    }
    try {
      await this.device.startCamera(video);
      this.cameraActive.set(true);
      this.status.set('Apunta la cámara y toca «Tomar foto».');
    } catch (error) {
      this.status.set('No se pudo abrir la cámara: ' + this.messageOf(error));
    }
  }

  async capturePhoto(): Promise<void> {
    const video = this.videoRef?.nativeElement;
    if (!video) return;
    try {
      const dataUrl = await this.device.captureImage(video);
      this.device.image = dataUrl;
      this.setPreview(dataUrl);
      this.cameraActive.set(false);
      this.device.stopCamera(video);
      this.status.set('¡Foto capturada! Se usará en tu momento.');
      this.device.vibrate([50]);
    } catch (error) {
      this.status.set(this.messageOf(error));
    }
  }

  async onFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await this.device.readFileAsDataUrl(file);
      this.device.image = dataUrl;
      this.setPreview(dataUrl);
      this.cameraActive.set(false);
      this.device.stopCamera(this.videoRef?.nativeElement);
      this.status.set('Foto elegida desde tu dispositivo.');
    } catch (error) {
      this.status.set('No se pudo leer la foto: ' + this.messageOf(error));
    }
  }

  removePhoto(): void {
    this.resetPhoto();
    this.status.set('Se usará la imagen por defecto.');
  }

  async useLocation(): Promise<void> {
    try {
      this.status.set('Obteniendo ubicación del dispositivo…');
      const position = await this.device.getCurrentPosition();
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const coords = `Ubicación actual: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;

      this.status.set('Buscando la ciudad…');
      const city = await this.device.reverseGeocode(lat, lon);
      this.location.set(city || coords);
      this.status.set(city ? 'Ciudad obtenida por GPS.' : 'Se usaron las coordenadas.');
      this.device.vibrate([50]);
    } catch (error) {
      this.status.set('No se pudo obtener la ubicación: ' + this.messageOf(error));
    }
  }

  async publish(): Promise<void> {
    if (!this.title().trim()) {
      this.showSnackbar('Escribe un título para tu momento.');
      return;
    }

    // Construir el post ANTES de cerrar: al cerrar se descarta la foto capturada.
    const post: Post = {
      title: this.title().trim(),
      location: this.location().trim() || 'Ubicación no especificada',
      image: this.device.image || this.defaultImage,
    };

    this.closeModal();

    try {
      await this.postService.createPost(post);
      this.title.set('');
      this.location.set('');
      this.showSnackbar('¡Momento publicado!');
      this.device.vibrate([80, 40, 80]);
      if (this.notifications.permission === 'granted') {
        await this.notifications.show('Momento publicado', {
          body: 'Tu momento ya está en UTEQGram.',
        });
      }
      await this.loadPosts();
    } catch (error) {
      console.error(error);
      this.showSnackbar('No se pudo guardar el momento.');
    }
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
