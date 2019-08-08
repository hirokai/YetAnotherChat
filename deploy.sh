scp *.js coisns:~
scp *.json coisns:~
scp client/* coisns:~/client/
scp common/* coisns:~/common/
scp server/* coisns:~/server/
scp server/private/* coisns:~/server/private/
scp *.sh coisns:~
scp other/* coisns:~/other/
scp migration/* coisns:~/migration/
scp -pr public coisns:~/
# scp -pr mailgun/ coisns:~/