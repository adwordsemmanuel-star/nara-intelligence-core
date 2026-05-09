import ftplib

def test_upload():
    host = "somos-nara.com"
    user = "admin@somos-nara.com"
    password = "Dajtan-devwa8-miskig"
    
    ftp = ftplib.FTP(host)
    ftp.login(user, password)
    
    with open("test_ftp.txt", "w") as f:
        f.write("NARA TEST")
        
    with open("test_ftp.txt", "rb") as f:
        ftp.storbinary("STOR test_ftp.txt", f)
        
    print("Subí test_ftp.txt")
    ftp.quit()

if __name__ == "__main__":
    test_upload()
