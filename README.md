# Baca Halaman

Baca Halaman adalah ekstensi Chrome dan Edge untuk Windows. Buka panel dari tab yang ingin dibaca, lalu gunakan Ollama untuk meringkas, menjelaskan, menerjemahkan, atau menjawab pertanyaan tentang isinya. Model bawaan `gemma4:e4b` juga bisa membaca satu gambar yang terlihat utuh dan relevan di halaman.

## 1. Pasang Ollama dan unduh model

1. Unduh dan jalankan installer [Ollama untuk Windows](https://ollama.com/download/windows).
2. Buka **Ollama** dari Start Menu. Ollama berjalan di latar belakang dan menyediakan API lokal di `http://127.0.0.1:11434`.
3. Buka PowerShell biasa, lalu jalankan dua perintah ini. Tunggu perintah pertama selesai sebelum menjalankan yang kedua.

   ```powershell
   ollama pull gemma4:e4b
   ollama list
   ```

Jika `gemma4:e4b` terlihat di daftar, model siap dipilih di ekstensi. Kamu perlu internet untuk mengunduh aplikasi, ekstensi, dan model saat pemasangan awal. [Ollama di Windows](https://docs.ollama.com/windows) · [Gemma 4 E4B](https://ollama.com/library/gemma4:e4b)

## 2. Muat ekstensi di Chrome atau Edge

1. Di halaman [repositori Baca Halaman](https://github.com/attaqifa/local-llm-extension), pilih **Code → Download ZIP**. Ekstrak ZIP ke folder yang ingin kamu pakai untuk menyimpan ekstensi. Jika repositori sudah ada di komputer, langsung gunakan folder tersebut.
2. Buka `chrome://extensions` di Chrome atau `edge://extensions` di Edge.
3. Aktifkan **Developer mode** (**Mode pengembang**).
4. Klik **Load unpacked** (**Muat ekstensi yang belum dipaketkan**). Pilih subfolder **`extension`** yang berisi `manifest.json`.
5. Cari kartu **Baca Halaman** dan salin **ID** yang tertera. Jika ID belum terlihat, buka **Details** (**Detail**). Lewat ikon puzzle di toolbar, kamu juga bisa menyematkan **Baca Halaman** supaya mudah dibuka. [Panduan Chrome](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) · [Panduan Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/extension-sideloading)

## 3. Beri izin koneksi sekali di Windows

Ollama perlu mengizinkan alamat ekstensi sebelum panel bisa mengirim pertanyaan. Alamat ini disebut *origin*. Bentuknya `chrome-extension://ID_EKSTENSI` di Chrome dan Edge. Ganti `ID_EKSTENSI` dengan ID dari browser kamu, tanpa garis miring di akhir. Kalau panel sudah menampilkan **Pengaturan → Tambahkan … ke OLLAMA_ORIGINS**, kamu bisa menyalin alamat lengkapnya dari sana. [Panduan izin origin Ollama](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama)

1. Keluar dari Ollama lewat ikon tray di dekat jam Windows. Jika kamu menjalankan `ollama serve` dari terminal, hentikan sesi itu dengan **Ctrl+C**.
2. Di Start Menu Windows, cari dan buka **Edit environment variables for your account**. Jika yang terbuka adalah **System Properties**, klik **Environment Variables…**.
3. Di bagian **User variables** (**Variabel pengguna**), cari `OLLAMA_ORIGINS`. Jika belum ada, klik **New…** dan gunakan nilai berikut.

   | Kolom | Isi |
   | --- | --- |
   | Variable name | `OLLAMA_ORIGINS` |
   | Variable value | `chrome-extension://ID_EKSTENSI` dengan ID dari browser kamu |

   Jika `OLLAMA_ORIGINS` sudah ada, pilih **Edit…**. Pertahankan nilai lama dan tambahkan alamat baru dengan pemisah koma tanpa spasi. Gunakan cara yang sama jika kamu memasang ekstensi di Chrome dan Edge dan ID-nya berbeda.

4. Klik **OK** sampai jendela pengaturan tertutup. Buka lagi **Ollama** dari Start Menu agar konfigurasi baru terbaca. [Konfigurasi Ollama di Windows](https://docs.ollama.com/faq#setting-environment-variables-on-windows)

Setelah disimpan, izin berlaku setiap kali Ollama dibuka. Ulangi pengaturan hanya jika ID ekstensi berubah atau kamu memakai instalasi lain dengan ID berbeda.

## 4. Cek sambungan dan coba bertanya

1. Buka halaman web biasa yang berisi teks. Klik ikon **Baca Halaman** di toolbar atau tekan **Alt+Shift+G**.
2. Di panel, buka **Pengaturan**, lalu klik **Cek ulang**. Tunggu status **Ollama lokal tersambung.** dan pastikan **Model lokal** menampilkan `gemma4:e4b`.
3. Buka **Sumber** untuk melihat teks tab. Kembali ke **Percakapan**, lalu coba pertanyaan *Apa tiga poin utama halaman ini?* dan klik **Kirim**.
4. Untuk mencoba pemindaian, buka halaman dengan gambar berisi tulisan yang terlihat utuh. Buka panel dari tab tersebut dan tunggu hasilnya muncul di **Sumber**. Klik judul sumber gambar untuk memeriksa atau mengoreksi isinya.

### Tambahkan screenshot atau file gambar

1. Buka **Sumber → Tambah sumber**. Tempel screenshot dengan **Ctrl+V** di kotak teks, atau pilih file PNG, JPEG, atau WebP. Batas ukuran file gambar adalah 20 MB.
2. Klik **Baca gambar**. Gunakan **Batal** jika ingin menghentikan pembacaan.
3. Setelah selesai, hasil muncul di **Sumber**. Koreksi teks bila perlu, lalu buka **Percakapan** untuk bertanya. Pertanyaan memakai teks hasil bacaan yang sudah dikoreksi.

### Baca area tertentu langsung dari tab

1. Buka **Baca Halaman** dari tab yang ingin dipindai. Gulir sampai bagian yang ingin dibaca terlihat.
2. Klik **Sumber → Opsi pemindaian → Pilih area**, lalu seret dari satu sudut ke sudut lain di halaman dan lepaskan. Tekan **Esc** untuk batal.
3. Gemma membaca potongan itu dan menambahkan hasilnya ke **Sumber**. Kamu bisa mengoreksi teksnya sebelum bertanya.

**Uji offline.** Buka halaman sumber terlebih dahulu, putuskan internet, lalu ajukan pertanyaan baru dari panel tanpa memuat ulang halaman. Setelah Ollama dan model terpasang, ekstensi mengirim permintaan ke API lokal. Untuk halaman yang tidak bisa dimuat saat offline, gunakan **Sumber → Tambah sumber** untuk menempel teks atau membuka file TXT atau Markdown.

## Jika sambungan bermasalah

| Gejala | Yang bisa kamu lakukan |
| --- | --- |
| **Izin koneksi diperlukan** atau Ollama menolak akses | Salin alamat dari **Pengaturan**. Pastikan nilai di **User variables** cocok dengan ekstensi yang sedang dipakai, termasuk awalan `chrome-extension://`. Keluar dari Ollama lewat tray, jalankan lagi dari Start Menu, lalu klik **Cek ulang**. |
| Ollama tidak dapat dijangkau | Buka `http://127.0.0.1:11434` di tab biasa. Jika halaman API lokal tidak terbuka, jalankan Ollama dari Start Menu dan coba lagi dari panel. |
| `ollama serve` menampilkan kesalahan `bind` di port `11434` | Port sedang dipakai. Jika API lokal bisa dibuka dan aplikasi Ollama sudah berjalan, gunakan instance tersebut. Jika baru mengubah izin, keluar dari Ollama lewat tray dan buka lagi dari Start Menu. |
| Model lokal belum siap atau tidak muncul | Jalankan `ollama list`. Jika `gemma4:e4b` belum ada, sambungkan internet dan jalankan `ollama pull gemma4:e4b`. Kemudian klik **Cek ulang**. |
| PowerShell tidak mengenali perintah `ollama` | Tutup dan buka kembali PowerShell setelah instalasi. Jika perintah masih tidak dikenali, cek pemasangan Ollama. |
| Panel tersambung tetapi teks tab tidak muncul | Coba halaman web biasa. Halaman pengaturan browser dan PDF di penampil bawaan bisa membatasi akses. Gunakan **Tambah sumber** untuk memasukkan teks secara manual. |
| Teks terbaca tetapi gambar tidak masuk ke **Sumber** | Pilih model yang mendukung gambar, seperti `gemma4:e4b`. Gulir sampai gambar terlihat utuh, lalu klik **Sumber → Opsi pemindaian → Pindai ulang** jika belum ada hasil gambar di sesi tersebut. |

Jika kamu memperbarui file proyek, buka kembali halaman ekstensi dan klik **Reload** (**Muat ulang**) pada kartu **Baca Halaman**, lalu buka panel dari tab sumber.

[Rancangan dan tahapan pengembangan](RANCANGAN.md)
