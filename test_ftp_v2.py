import ftplib
import socket

def try_ftp(host):
    print(f"Probando host: {host}")
    user = "admin@somos-nara.com"
    password = "Dajtan-devwa8-miskig"
    try:
        # Resolve hostname first
        ip = socket.gethostbyname(host)
        print(f"IP resuelta: {ip}")
        
        ftp = ftplib.FTP(host, timeout=10)
        ftp.login(user, password)
        print(f"✅ Conectado con éxito a {host}!")
        ftp.quit()
        return True
    except Exception as e:
        print(f"❌ Falló {host}: {e}")
        return False

hosts = ["ftp.diego-reyes.com.mx", "diego-reyes.com.mx", "somos-nara.com", "ftp.somos-nara.com"]
for h in hosts:
    if try_ftp(h):
        break
