mkdir  c:\noobaa
cd c:\noobaa
rem powershell wget https://s3.eu-central-1.amazonaws.com/noobaa-core/noobaa-setup.exe -OutFile noobaa-setup.exe
echo [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true} >>noobaa.ps1
echo $myheaders = New-Object 'System.Collections.Generic.Dictionary[String,String]' >>noobaa.ps1
echo $myheaders.Add("Metadata-Flavor","Google") >>noobaa.ps1
echo wget http://metadata/computeMetadata/v1/instance/attributes/env -Headers $myheaders -OutFile env.txt >>noobaa.ps1
echo $env_name = [IO.File]::ReadAllText("env.txt") >>noobaa.ps1
echo $setup_link = 'https://'+$env_name+':8443/public/noobaa-setup.exe' >>noobaa.ps1
echo $wc = New-Object System.Net.WebClient >>noobaa.ps1
echo $wc.DownloadFile($setup_link,"noobaa-setup.exe")  >>noobaa.ps1
echo wget http://metadata/computeMetadata/v1/instance/attributes/agent_conf -Headers $myheaders -OutFile agent_conf.txt>>noobaa.ps1
echo $agent_conf= [IO.File]::ReadAllText("agent_conf.txt")>>noobaa.ps1
echo .\noobaa-setup.exe /S /config $agent_conf>>noobaa.ps1
powershell noobaa.ps1
