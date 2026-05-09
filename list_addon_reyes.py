import ftplib

def list_addon():
    host = "somos-nara.com"
    user = "reyes@somos-nara.com"
    password = "koXzuf-jyzset-dizri2"
    
    ftp = ftplib.FTP(host)
    ftp.login(user, password)
    
    print("Files in /somos-nara.com/ (according to Reyes user):")
    ftp.retrlines('LIST -a')
    
    ftp.quit()

if __name__ == "__main__":
    list_addon()
