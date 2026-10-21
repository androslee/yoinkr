/* Yoinkr compatibility layer; original GIMP function follows this block.
 * Retains the newest 100 raw points: original function accesses at most quality
 * points, and GIMP's public quality option is bounded to 100. GTK is not used.
 */
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include "smoothing.h"
typedef int gint;
typedef unsigned int guint;
typedef double gdouble;
typedef struct {double x,y,velocity;} GimpCoords;
typedef struct {unsigned int len;GimpCoords points[100];} GArray;
typedef struct {int use_smoothing,smoothing_quality;double smoothing_factor;} GimpSmoothingOptions;
typedef struct {GArray *stroke_buffer;} GimpPaintCore;
typedef struct {GimpSmoothingOptions *smoothing_options;} GimpPaintOptions;
struct YoinkrSmoother {GArray history;GimpSmoothingOptions options;};
#define MIN(a,b) ((guint)(a)<(guint)(b)?(guint)(a):(guint)(b))
#define SQR(a) ((a)*(a))
#define G_PI 3.14159265358979323846
static void append_point(GArray *a,GimpCoords p){if(a->len==100){memmove(a->points,a->points+1,99*sizeof(GimpCoords));a->len--;}a->points[a->len++]=p;}
#define g_array_append_val(array,value) append_point(array,value)
#define g_array_index(array,type,index) ((array)->points[(index)])
