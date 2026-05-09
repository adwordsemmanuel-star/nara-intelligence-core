import ftplib

def list_root():
    host = "somos-nara.com"
    user = "admin@somos-nara.com"
    password = "Dajtan-devwa8-miskig"
    
    ftp = ftplib.FTP(host)
    ftp.login(user, password)
    print("Directorio actual:", ftp.pwd())
    print("Contenido:")
    ftp.retrlines('LIST')
    ftp.quit()

if __name__ == "__main__":
    list_root()
