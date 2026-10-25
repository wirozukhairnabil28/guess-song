# Tunggu server aktif di port 8000, lalu buka browser
$url = 'http://127.0.0.1:8000/'
$maxAttempts = 30
$attempt = 0

while ($attempt -lt $maxAttempts) {
    Start-Sleep -Milliseconds 500
    $attempt++
    try {
        $client = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 8000)
        if ($client.Connected) {
            $client.Close()
            Start-Process $url
            exit 0
        }
    } catch {
        # Server belum siap, ulangi
    }
}

# Fallback jika timeout: tetap buka browser
Start-Process $url
