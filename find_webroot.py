import ftplib

def check_folders():
    host = "somos-nara.com"
    user = "admin@somos-nara.com"
    password = "Dajtan-devwa8-miskig"
    
    ftp = ftplib.FTP(host)
    ftp.login(user, password)
    
    print("Directorio actual:", ftp.pwd())
    
    folders_to_try = ["public_html", "httpdocs", "www", "somos-nara.com"]
    for folder in folders_to_try:
        try:
            ftp.cwd(folder)
            print(f"✅ Carpeta encontrada: {folder}")
            print(f"Contenido de {folder}:")
            ftp.retrlines('LIST')
            ftp.cwd("..")
        except:
            print(f"❌ No existe: {folder}")
            
    ftp.quit()

if __name__ == "__main__":
    check_folders()
