# Aturan Keamanan (selalu berlaku)

- Jangan membuat file berisi rahasia asli. Gunakan `.env.example`.
- Jangan menonaktifkan validasi upload atau rate limit demi mempermudah pengembangan.
- Jangan menampilkan output model sebagai HTML mentah; selalu di-escape atau lewat renderer Markdown aman.
- Jangan menyimpan modul pengguna di folder yang dapat diakses publik.
- Jangan menjalankan perintah terminal yang menghapus data atau mengubah sistem tanpa konfirmasi pengguna.
