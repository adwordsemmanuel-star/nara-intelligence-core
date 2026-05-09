import ftplib
import os

def test_ftp():
    host = "ftp.diego-reyes.com.mx"
    user = "admin@somos-nara.com"
    password = "Dajtan-devwa8-miskig"
    
    try:
        ftp = ftplib.FTP(host)
        ftp.login(user, password)
        print("✅ Conectado con éxito!")
        print("Directorio actual:", ftp.pwd())
        print("Lista de archivos:")
        ftp.retrlines('LIST')
        ftp.quit()
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_ftp()
