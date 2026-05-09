import ftplib

def list_all():
    host = "somos-nara.com"
    user = "admin@somos-nara.com"
    password = "Dajtan-devwa8-miskig"
    
    ftp = ftplib.FTP(host)
    ftp.login(user, password)
    
    print("Listing with -a:")
    ftp.retrlines('LIST -a')
    
    ftp.quit()

if __name__ == "__main__":
    list_all()
