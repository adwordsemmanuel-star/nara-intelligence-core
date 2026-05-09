import ftplib

def go_up():
    host = "somos-nara.com"
    user = "admin@somos-nara.com"
    password = "Dajtan-devwa8-miskig"
    
    ftp = ftplib.FTP(host)
    ftp.login(user, password)
    
    print("Directorio actual:", ftp.pwd())
    try:
        ftp.cwd("..")
        print("Subí un nivel. Directorio actual:", ftp.pwd())
        print("Contenido:")
        ftp.retrlines('LIST')
    except:
        print("❌ No se puede subir más.")
            
    ftp.quit()

if __name__ == "__main__":
    go_up()
