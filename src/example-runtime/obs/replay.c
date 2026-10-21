/* Local deterministic replay utility, not a GUI or original-GIMP acceptance. */
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#include "smoothing.h"
int main(int argc,char **argv){
 if(argc!=4){fprintf(stderr,"Use: replay <enabled 0|1> <quality 1..100> <weight 3..1000>\n");return 2;}
 char *end;errno=0;long enabled=strtol(argv[1],&end,10);if(errno||*end||enabled<0||enabled>1)return 2;
 errno=0;long quality=strtol(argv[2],&end,10);if(errno||*end||quality<1||quality>100)return 2;
 errno=0;double weight=strtod(argv[3],&end);if(errno||*end)return 2;
 YoinkrSmoother *s=yoinkr_smoother_new((int)enabled,(int)quality,weight);if(!s)return 2;
 double x,y,v,ox,oy;int count=0,fields;
 while((fields=scanf("%lf %lf %lf",&x,&y,&v))==3){if(++count>10000||!yoinkr_smoother_feed(s,x,y,v,&ox,&oy)){yoinkr_smoother_free(s);return 3;}printf("%.17g %.17g\n",ox,oy);}
 yoinkr_smoother_free(s);return fields==EOF?0:3;
}
