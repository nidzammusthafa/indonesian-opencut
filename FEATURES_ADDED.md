# Fitur yang Ditambahkan ke OpenCut-Classic

Dokumen ini melacak fitur-fitur yang di-porting dari aplikasi lama ke `opencut-classic` selama proses pengembangan. Dokumen ini dapat digunakan sebagai panduan/checklist ketika melakukan implementasi ulang pada arsitektur OpenCut yang baru.

## Daftar Fitur & Status Implementasi

- [x] **1. Auto-Caption Bahasa Indonesia**
  - Menambahkan kode bahasa `id` (Indonesian) dan `ms` (Malay) ke dalam database bahasa transkripsi.
- [x] **2. Highlight Teks yang Sedang Diucapkan**
  - Menerapkan pewarnaan highlight dinamis pada kata yang sedang diucapkan saat playback (menggunakan timing per kata).
- [x] **3. Border (Stroke) Teks Caption**
  - Menambahkan pengaturan border (warna & ketebalan) pada teks/caption yang dirender di kanvas.
- [x] **4. Opacity Background Caption**
  - Menambahkan slider kontrol transparansi untuk warna latar belakang kotak teks.
- [x] **5. Caption Manual**
  - Tombol "+ Tambah Caption di Playhead" dan daftar subtitle editable inline dengan tombol hapus.
- [x] **6. Watermark Massal (Halaman Terpisah)**
  - Halaman tools terpisah (`/tools/watermark`) untuk memproses banyak video sekaligus menggunakan `ffmpeg.wasm` dengan template style teks/gambar.
- [x] **7. Tampilkan Resolusi Output saat Export**
  - Menampilkan label resolusi piksel standar (360p, 720p, 1080p, 4K) dan estimasi bitrate di panel opsi export.

## Fitur Lanjutan (Sesi 2)

- [x] **8. Font Picker Komprehensif di Properti Panel & Watermark**
  - Mengganti input teks dengan custom FontPicker popover yang mendukung visual preview, searching, dan tabs (All/My Fonts/Favorites).
- [x] **9. Kustomisasi Lanjutan Highlight Teks**
  - Menambahkan dukungan highlight dengan border/stroke (warna & ukuran) serta penskalaan ukuran font dinamis untuk kata aktif.
- [x] **10. Mode Pengaturan Caption (Global vs Individual)**
  - Toggle sinkronisasi style: Mode Global akan secara otomatis menyebarkan style caption yang diedit ke seluruh caption dalam track (kecuali isi teks dan timing).
- [x] **11. Cloudflare Workers AI Whisper Integration**
  - Opsi transkripsi via Cloudflare API untuk kinerja ultra cepat dan akurasi tinggi menggunakan model `whisper-large-v3-turbo`.
- [x] **12. Peningkatan Fitur Watermark Massal**
  - **Aspect Ratio**: Dukungan dynamic layout untuk Landscape (16:9), Portrait (9:16), Square (1:1), dan Standard (4:3).
  - **Dynamic Scale Sync**: Preview visual watermark di editor menyesuaikan secara presisi terhadap ukuran resolusi video asli.
  - **Dual Watermark**: Membakar 2 watermark berbeda di durasi yang terbagi (50% awal di atas, 50% akhir di bawah).
  - **Drag & Drop**: Unggah file dengan melepas video langsung ke area browser mana saja dengan overlay visual.
- [x] **13. Halaman Hapus Watermark Massal**
  - Menambahkan utilitas tools baru `/tools/remove-watermark` dengan bounding box sensor/blur yang interaktif (FFmpeg `delogo` filter) untuk menyensor logo secara massal.
- [x] **14. Custom Scrollbar & Navigasi Cepat**
  - Menerapkan custom elegant slim scrollbar di seluruh antarmuka workspace dan menyisipkan navigasi cepat di Header.

