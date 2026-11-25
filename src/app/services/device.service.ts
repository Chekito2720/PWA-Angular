import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DeviceService {
  private stream: MediaStream | null = null;
  private capturedImage: string | null = null;

  get isCameraSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  get image(): string | null {
    return this.capturedImage;
  }

  set image(value: string | null) {
    this.capturedImage = value;
  }

  resetImage(): void {
    this.capturedImage = null;
  }

  async startCamera(video: HTMLVideoElement): Promise<void> {
    if (!this.isCameraSupported) {
      throw new Error('Tu navegador no permite acceder a la cámara.');
    }
    this.stopCamera(video);

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    video.srcObject = this.stream;
    await video.play().catch(() => undefined);
  }

  stopCamera(video?: HTMLVideoElement): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (video) video.srcObject = null;
  }

  captureImage(video: HTMLVideoElement): Promise<string> {
    if (!video.videoWidth) {
      return Promise.reject(new Error('La cámara todavía no está lista.'));
    }

    const maxSide = 1024;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

    this.capturedImage = canvas.toDataURL('image/jpeg', 0.7);
    return Promise.resolve(this.capturedImage);
  }

  readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('La geolocalización no está disponible.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      });
    });
  }

  /** Reverse geocoding gratuito (BigDataCloud, sin API key, CORS abierto). */
  async reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
    try {
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=es`,
      );
      if (!response.ok) return null;

      const data = await response.json();
      const city = data.city || data.locality || data.principalSubdivision;
      const parts: string[] = [];
      if (city) parts.push(city);
      if (data.principalSubdivision && data.principalSubdivision !== city) {
        parts.push(data.principalSubdivision);
      }
      if (data.countryName) parts.push(data.countryName);
      return parts.length ? parts.join(', ') : null;
    } catch (error) {
      console.warn('[Dispositivo] No se pudo resolver la ciudad', error);
      return null;
    }
  }

  vibrate(pattern: number | number[] = [80, 40, 80]): boolean {
    return navigator.vibrate ? navigator.vibrate(pattern) : false;
  }
}
