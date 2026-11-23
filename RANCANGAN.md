# Rancangan extension Ollama untuk penggunaan harian

Dokumen kerja untuk membangun extension Manifest V3 di Chrome dan Edge pada Windows. Extension membuka panel samping, membaca tab aktif, memindai gambar yang relevan, lalu menyediakan alat untuk bertanya dan mengolah sumber secara lokal lewat `gemma4:e4b`.

## Pengalaman saat membuka extension

1. Klik ikon extension atau tekan `Alt+Shift+G`. Panel samping terbuka pada jendela browser yang sama. Halaman sumber tetap terlihat.
2. Panel langsung menampilkan judul tab dan status **Membaca halaman**. Setelah teks tersedia, panel menampilkan **Teks siap**, pratinjau sumber, dan kotak pertanyaan.
3. Jika ada gambar yang layak dipindai, panel langsung memproses satu gambar yang paling relevan dan menampilkan **Memindai gambar**. Hasilnya masuk ke daftar sumber. Pengguna bisa memilih gambar lain atau langsung memakai teks yang sudah siap.
4. Profil bawaan **Harian** menyiapkan konteks, lalu menunggu pertanyaan atau pilihan alat. Profil **Jawab cepat** bisa langsung menjawab soal dari halaman. Sebuah jawaban pilihan ganda diawali huruf dan teks pilihan, diikuti alasan singkat.
5. Saat pengguna pindah tab, panel menandai bahwa sumber berasal dari tab sebelumnya. Klik ikon atau shortcut di tab baru untuk membaca sumber baru. Tombol **Pindai ulang** membaca ulang tab sumber selama izin aksesnya masih berlaku.

### Tampilan

- Warna dasar putih (`#FFFFFF`), garis pembatas abu-abu muda (`#E5E7EB`), teks gelap (`#111827`), dan font sistem. Gunakan penekanan warna seperlunya untuk fokus, tindakan utama, dan status. Beri nama dan ikon generik yang mudah dikenali sebagai extension.
- Susun panel menjadi header, baris alat, area sumber dan percakapan, lalu kotak pertanyaan. Header memuat judul tab, status Ollama, dan **Pengaturan**. Baris alat menampilkan **Pindai ulang**, **Sumber**, dan **Tambah**.
- Area percakapan bisa digulir. Kotak pertanyaan, tombol **Kirim**, dan tombol **Hentikan** tetap mudah dijangkau. Daftar sumber bisa dilipat setelah selesai diperiksa.
- Gunakan lebar panel yang disediakan browser. Susun ulang kontrol agar tetap terbaca saat panel dipersempit. Tempatkan pengaturan profil dan model di halaman pengaturan extension.

## Alat dan pengaturan

| Alat | Perilaku |
| --- | --- |
| Baca tab | Ambil teks utama secara default. Pilihan lainnya meliputi teks yang diblok, teks yang terlihat di viewport, atau seluruh teks halaman yang dirender. |
| Kelola sumber | Tinjau, edit, urutkan, hapus, atau salin bagian sumber. Gabungkan teks dari halaman, catatan manual, dan hasil pembacaan gambar. |
| Tanya halaman | Jawab pertanyaan dengan sumber aktif, terima pertanyaan lanjutan, dan tampilkan label sumber yang disertakan dalam permintaan. |
| Olah teks | Sediakan **Jawab soal**, **Ringkas**, **Jelaskan**, dan **Terjemahkan**. Semua menggunakan editor sumber dan alur permintaan yang sama. |
| Pindai gambar | Pindai otomatis saat panel dibuka. Pengguna juga bisa memilih gambar halaman, memilih area tab, menangkap viewport, menempel screenshot, atau membuka PNG, JPEG, dan WebP lokal. |
| Tinjau transkripsi | Minta Gemma menyalin tulisan dari gambar. Pengguna bisa mengoreksi atau menyalin hasilnya dan memakai teks yang sudah diedit untuk pertanyaan berikutnya. |
| Tambah teks | Ketik, tempel, atau buka TXT dan Markdown lokal. Tambahkan ke kumpulan sumber yang sedang dipakai. |

- **Harian** memakai teks utama dan memindai satu gambar yang layak secara otomatis. Jika teks utama kosong, gunakan teks halaman yang dirender. Pengguna memulai percakapan sendiri.
- **Jawab cepat** memakai urutan teks yang diblok lalu teks utama. Saat ada gambar yang terpilih otomatis, sertakan satu gambar dalam permintaan jawaban yang sama. Sediakan hasil teks jika gambar gagal diambil.
- **Tinjau transkripsi** memprioritaskan transkripsi gambar yang bisa diedit. Pengguna menekan **Jawab** untuk memakai teks final.
- Pengguna bisa mengedit dan menduplikasi profil, memilih sumber dan urutan cadangan, mengatur batas teks, memilih 0–3 gambar otomatis, mengatur bahasa jawaban, dan menulis instruksi tambahan. Profil dapat dipilih manual atau dikaitkan dengan hostname yang sama persis. Urutan pemilihan adalah pilihan manual untuk sesi tersebut, aturan hostname, lalu profil default.
- Pengaturan lanjutan memuat model lokal, batas konteks dan keluaran, `temperature`, `think` untuk model yang mendukungnya, dan `keep_alive`. Mulai dengan batas sumber gabungan 6.000 karakter, jawaban ringkas bahasa Indonesia, `think: false`, dan `keep_alive: "5m"`.

## Arsitektur dan alur data

### Tab dan siklus hidup browser

- Buat extension tanpa proses build menggunakan HTML, CSS, dan modul JavaScript. Letakkan manifest dan aset yang dimuat browser di `extension/`. Gunakan `sidePanel`, `activeTab`, `scripting`, dan `storage`, serta izin host untuk `127.0.0.1`. Terapkan CSP yang membatasi koneksi ke `http://127.0.0.1:11434`. [Panel samping Chrome](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) · [Sidebar Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/sidebar) · [Izin activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- Service worker menerima klik ikon maupun shortcut dan memanggil `chrome.sidePanel.open({ windowId })` dari handler gestur sebelum operasi asinkron lain. Teruskan konteks mulai yang berisi `windowId`, `tabId`, dan `requestId`. Simpan konteks kecil itu di `chrome.storage.session` agar bisa diterima baik saat panel baru dimuat maupun saat sudah terbuka. Jika panel dibuka dari pemilih sidebar browser tanpa konteks akses, tampilkan instruksi singkat untuk mengklik ikon atau shortcut di tab sumber.
- Jalankan ekstraksi di frame utama lewat `chrome.scripting.executeScript`. Ikat hasil ke `windowId`, `tabId`, `documentId`, dan `requestId`. Hentikan pekerjaan lama saat sumber berubah. Pada navigasi dokumen, cek ulang sebelum mengambil gambar atau menjalankan aksi otomatis. Hasil hanya boleh memperbarui sesi dan dokumen yang memulainya.
- Gunakan `main`, `[role="main"]`, atau `article` dalam urutan itu untuk mode teks utama. Pertahankan judul, paragraf, daftar, baris tabel, dan label pilihan dalam urutan DOM. Ambil teks yang dirender dan abaikan navigasi, footer, elemen tersembunyi, dan nilai yang diketik di formulir. Tunjukkan jika batas konteks memotong teks. Halaman internal browser, PDF bawaan, atau tab yang tidak bisa diakses tetap bisa memakai input manual.

### Pemindaian gambar

- Inventarisasikan gambar yang dirender di konten utama, termasuk `<img>`, `<canvas>`, dan SVG yang menjadi bagian isi. Urutkan gambar yang terlihat dan berada dekat teks utama lebih dulu. Lewati ikon, avatar, logo kecil, serta gambar dekoratif yang bisa diidentifikasi. Tampilkan daftar kandidat terlepas dari jumlah gambar yang diproses otomatis.
- Gunakan satu tangkapan viewport untuk memotong gambar yang terpilih. Tunggu viewport stabil setelah panel terbuka, lalu cocokkan tab aktif, identitas dokumen, posisi gulir, dan ukuran viewport sebelum serta sesudah tangkapan. Konversi koordinat CSS berdasarkan perbandingan ukuran bitmap dengan viewport. Jika area bergeser, buang tangkapan dan coba ulang sekali setelah stabil. Untuk gambar di luar viewport atau terpotong, minta pengguna menampilkannya atau memilih area manual. [API tangkapan viewport](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab)
- Proses hanya potongan gambar yang dipilih. Untuk alat **Pilih area**, hilangkan penanda pilihan sebelum tangkapan dan dukung `Esc`. Tombol **Pindai gambar** pada profil Harian meminta Gemma membaca label, angka, dan unsur visual penting. Teks hasil pindai bisa digunakan dalam pertanyaan berikutnya. Pengguna bisa menyalakan **Sertakan gambar asli** untuk pertanyaan yang bergantung pada detail visual.
- Pakai satu pekerjaan Ollama aktif per panel. Saat pengguna mengirim pertanyaan dengan teks saja, hentikan pemindaian otomatis yang masih berjalan dan dahulukan pertanyaannya. Pada mode Jawab cepat, kirim gambar dan soal dalam satu permintaan agar pemindaian dan jawaban tidak mengulang pembacaan gambar.

### Sesi, model, dan data lokal

- Simpan sumber sebagai daftar terurut berisi jenis, label, isi teks, dan lampiran gambar opsional. Simpan percakapan dan hasil pindai di memori panel. Simpan hanya konfigurasi di `chrome.storage.local`. Buang isi sementara saat sesi ditutup atau sumber diganti. [Penyimpanan extension](https://developer.chrome.com/docs/extensions/reference/api/storage)
- Panel extension memanggil `POST /api/chat` di `http://127.0.0.1:11434`. Gunakan `GET /api/tags` untuk pilihan model dan `POST /api/show` untuk memeriksa kemampuan seperti `vision` dan kontrol berpikir. Kirim byte gambar base64 lewat `messages[].images` untuk permintaan bergambar. Baca respons NDJSON bertahap dan tampilkan `message.content`. [API Chat Ollama](https://docs.ollama.com/api/chat) · [Kemampuan model](https://docs.ollama.com/api-reference/show-model-details) · [Input gambar](https://docs.ollama.com/capabilities/vision)
- Susun instruksi yang dipilih pengguna dan tandai kutipan halaman, isi file, serta transkripsi sebagai data sumber. Render keluaran sebagai teks atau Markdown yang disanitasi. Alat seperti **Ringkas** dan **Terjemahkan** mengubah instruksi permintaan saja. Seluruh operasi browser tetap dikendalikan dari UI extension.
- Pakai `AbortController` untuk **Hentikan**, tutup panel, dan ganti sumber. Tangani Ollama tidak aktif, origin ditolak, model tidak ditemukan, model tanpa vision, gambar rusak, serta stream terputus dengan pesan dan tindakan yang sesuai. Pertahankan teks yang sudah siap jika pemindaian gambar gagal.

## Tahapan implementasi untuk agent

Kerjakan sesuai urutan. Pada akhir tiap tahap, jalankan verifikasi dan catat hasil aktual serta status pengujian yang masih bergantung pada browser atau Ollama lokal. Gunakan halaman uji lokal dengan teks yang diketahui, pilihan ganda, dan gambar berlabel.

### Tahap 1 · Panel dan pembacaan tab

- [ ] Siapkan manifest, service worker, shortcut, dan panel putih. Tampilkan status panel dan sumber serta tangani pembukaan panel dari ikon dan shortcut.
- [ ] Buat mode ekstraksi teks utama, pilihan, viewport, dan seluruh halaman. Sediakan pratinjau dan **Pindai ulang**.
- [ ] **Lulus ketika** panel membuka dan menampilkan teks tab aktif di Chrome serta Edge. Uji dua jendela, perpindahan tab saat memuat, pilihan ganda, input formulir, dan halaman yang dibatasi browser.

### Tahap 2 · Percakapan lokal dan alat teks

- [ ] Sambungkan Ollama, pencarian model lokal, streaming jawaban, dan pembatalan. Buat alat Tanya halaman, Jawab soal, Ringkas, Jelaskan, dan Terjemahkan di atas alur permintaan yang sama.
- [ ] Tambahkan kelola sumber, pertanyaan lanjutan, dan input teks manual atau file lokal. Pertahankan sumber yang telah dibaca jika koneksi gagal.
- [ ] **Lulus ketika** jalur teks bekerja dengan internet diputus dan Ollama aktif. Uji pembatalan, respons parsial, Ollama mati, origin ditolak, dan model tidak tersedia.

### Tahap 3 · Pemindaian dan alat gambar

- [ ] Buat inventaris gambar, pemilihan kandidat, pemindaian otomatis, serta tindakan manual untuk area tab, viewport, clipboard, dan file gambar.
- [ ] Tambahkan pembacaan langsung, tinjau transkripsi, dan penggabungan gambar dengan teks. Prioritaskan pertanyaan pengguna jika pemindaian otomatis masih berjalan.
- [ ] **Lulus ketika** halaman bergambar memulai satu pemindaian dari pembukaan panel. Uji diagram, gambar kosong atau terpotong, gambar di luar viewport, zoom browser dan skala Windows, perubahan tab saat tangkapan, serta penggunaan transkripsi yang sudah diedit. Pastikan halaman teks murni memakai jalur teks tanpa tangkapan.

### Tahap 4 · Profil, performa, dan pemasangan

- [ ] Tambahkan profil dan aturan hostname. Sediakan panduan **Load unpacked** di Chrome dan Edge, `OLLAMA_ORIGINS` untuk ID extension per browser, serta pengaturan Ollama lokal. Jelaskan bahwa instalasi Ollama dan pengunduhan model dilakukan sebelum pengujian offline. [Panduan Ollama](https://docs.ollama.com/faq)
- [ ] Ukur waktu hingga jawaban mulai tampil dan waktu hingga selesai. Uji teks umum serta screenshot teks Indonesia dan Inggris, tabel, diagram, dan rumus. Pisahkan hasil saat model baru dimuat dan saat model masih berada di memori.
- [ ] **Lulus ketika** kedua browser berhasil membaca tab, memindai gambar, dan menjawab secara offline. Periksa batas koneksi, retensi data, prioritas profil, serta penggunaan panel dengan keyboard dan pada lebar browser yang berbeda.

### Tahap lanjutan · OCR khusus dan mode mini

- [ ] Pertimbangkan OCR lokal hanya setelah jalur gambar langsung diukur. Gunakan sekitar 5 detik hingga jawaban pertama saat model sudah dimuat sebagai sasaran awal, dengan ketepatan soal tetap diutamakan. Jika pembacaan langsung konsisten lebih lambat pada screenshot teks cetak, bandingkan dengan Tesseract.js lokal (`ind` dan `eng`) → Gemma teks. Masukkan OCR khusus jika median waktu mulai jawab turun setidaknya 20% dan ketepatan informasi penting tetap setara. Diagram dan rumus tetap dapat memakai Gemma Vision. [Tesseract.js lokal](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)
- [ ] Tambahkan popup mini sebagai pilihan setelah panel harian stabil. Pakai kembali profil, ekstraksi, dan klien Ollama. Tentukan ulang dimensi popup pada tahap itu.
